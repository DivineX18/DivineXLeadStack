"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  Archive,
  FileText,
  Loader2,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToProducts } from "@/lib/firestore/products";
import { uploadProductFile } from "@/lib/products/upload-file";
import type { Product } from "@/types/products";

/**
 * Sub-account product catalog. Operator creates reusable products here;
 * the quote/invoice builder snapshots them into line items.
 *
 * v1 scope: name, description, unit price, currency, active toggle.
 * Recurring/subscription support deferred to v1.1.
 */

export default function ProductsPage() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId } = useSubAccount();

  const [products, setProducts] = useState<Product[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    const unsub = subscribeToProducts(
      { agencyId, subAccountId },
      setProducts,
    );
    return () => unsub();
  }, [user, agencyId, subAccountId, authLoading]);

  const visible = useMemo(
    () => products.filter((p) => showArchived || p.active),
    [products, showArchived],
  );
  const archivedCount = useMemo(
    () => products.filter((p) => !p.active).length,
    [products],
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reusable line items for quotes and invoices. Snapshotted into each
            document at the moment of add — editing a product never changes
            historical quotes or invoices.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          New product
        </Button>
      </div>

      {archivedCount > 0 && (
        <div className="flex items-center gap-2 text-xs">
          <label className="flex items-center gap-2 text-muted-foreground">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Show archived ({archivedCount})
          </label>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState onCreate={() => setCreating(true)} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Description</th>
                <th className="px-4 py-2.5 text-right font-medium">Price</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <ProductRow
                  key={p.id}
                  product={p}
                  subAccountId={subAccountId}
                  onEdit={() => setEditing(p)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ProductDialog
        open={creating || !!editing}
        product={editing}
        subAccountId={subAccountId}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border bg-card p-12 text-center">
      <Package className="mx-auto h-10 w-10 text-muted-foreground" />
      <h2 className="mt-4 text-base font-semibold">No products yet</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Add your first product to start building quotes and invoices.
      </p>
      <Button onClick={onCreate} className="mt-4">
        <Plus className="h-4 w-4" />
        New product
      </Button>
    </div>
  );
}

function ProductRow({
  product,
  subAccountId,
  onEdit,
}: {
  product: Product;
  subAccountId: string;
  onEdit: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function toggleArchive() {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/products/${product.id}`,
        product.active
          ? { method: "DELETE" }
          : {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ active: true }),
            },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed.");
      toast.success(product.active ? "Product archived." : "Product restored.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-3 font-medium">
        <div className="flex items-center gap-1.5">
          {product.name}
          {product.deliveryType === "file" && (
            <span
              title={`Delivers a file automatically on purchase${product.fileName ? `: ${product.fileName}` : ""}`}
              className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-400/15 dark:text-violet-300"
            >
              <FileText className="h-2.5 w-2.5" />
              Delivers file
            </span>
          )}
        </div>
      </td>
      <td className="max-w-md truncate px-4 py-3 text-muted-foreground">
        {product.description || (
          <span className="italic text-muted-foreground/60">No description</span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
        {formatPrice(product.unitPriceCents, product.currency)}
      </td>
      <td className="px-4 py-3">
        {product.active ? (
          <span className="inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            Active
          </span>
        ) : (
          <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            Archived
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={toggleArchive}
            title={product.active ? "Archive" : "Restore"}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : product.active ? (
              <Archive className="h-3.5 w-3.5" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </td>
    </tr>
  );
}

function ProductDialog({
  open,
  product,
  subAccountId,
  onClose,
}: {
  open: boolean;
  product: Product | null;
  subAccountId: string;
  onClose: () => void;
}) {
  const editing = !!product;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceDollars, setPriceDollars] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [saving, setSaving] = useState(false);

  const [deliveryType, setDeliveryType] = useState<"none" | "file">("none");
  const [fileMeta, setFileMeta] = useState<{
    storagePath: string;
    fileName: string;
    sizeBytes: number;
    contentType: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (product) {
      setName(product.name);
      setDescription(product.description);
      setPriceDollars((product.unitPriceCents / 100).toFixed(2));
      setCurrency(product.currency);
      setDeliveryType(product.deliveryType === "file" ? "file" : "none");
      setFileMeta(
        product.deliveryType === "file" && product.fileStoragePath
          ? {
              storagePath: product.fileStoragePath,
              fileName: product.fileName ?? "file",
              sizeBytes: product.fileSizeBytes ?? 0,
              contentType: product.fileContentType ?? "",
            }
          : null,
      );
    } else {
      setName("");
      setDescription("");
      setPriceDollars("");
      setCurrency("USD");
      setDeliveryType("none");
      setFileMeta(null);
    }
  }, [open, product]);

  async function handleFilePick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadProductFile(
        file,
        subAccountId,
        crypto.randomUUID(),
      );
      setFileMeta(uploaded);
      toast.success("File uploaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Name is required.");
      return;
    }
    const priceNum = Number(priceDollars);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      toast.error("Price must be a non-negative number.");
      return;
    }
    if (deliveryType === "file" && !fileMeta) {
      toast.error("Upload a file, or switch delivery back to \"No file\".");
      return;
    }
    const unitPriceCents = Math.round(priceNum * 100);

    setSaving(true);
    try {
      const payload = {
        name: trimmedName,
        description: description.trim(),
        unitPriceCents,
        currency: currency.trim().toUpperCase(),
        deliveryType,
        fileStoragePath: deliveryType === "file" ? fileMeta!.storagePath : null,
        fileName: deliveryType === "file" ? fileMeta!.fileName : null,
        fileSizeBytes: deliveryType === "file" ? fileMeta!.sizeBytes : null,
        fileContentType: deliveryType === "file" ? fileMeta!.contentType : null,
      };
      const res = await fetch(
        editing
          ? `/api/sub-accounts/${subAccountId}/products/${product!.id}`
          : `/api/sub-accounts/${subAccountId}/products`,
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        id?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to save.");
      }
      toast.success(editing ? "Product updated." : "Product created.");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit product" : "New product"}</DialogTitle>
          <DialogDescription>
            Reusable line item for quotes and invoices.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="product-name">Name</Label>
            <Input
              id="product-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Website audit"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product-description">Description</Label>
            <Textarea
              id="product-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional. Shown to the recipient on the invoice."
              rows={3}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="product-price">Unit price</Label>
              <Input
                id="product-price"
                type="number"
                step="0.01"
                min="0"
                value={priceDollars}
                onChange={(e) => setPriceDollars(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-currency">Currency</Label>
              <Input
                id="product-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3}
                placeholder="USD"
              />
            </div>
          </div>

          <div className="space-y-1.5 rounded-lg border p-3">
            <Label>Delivery</Label>
            <p className="text-xs text-muted-foreground">
              Attach a file to have it emailed automatically the moment a
              quote or invoice with this product on it is marked paid.
            </p>
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                variant={deliveryType === "none" ? "default" : "outline"}
                onClick={() => setDeliveryType("none")}
              >
                No file
              </Button>
              <Button
                type="button"
                size="sm"
                variant={deliveryType === "file" ? "default" : "outline"}
                onClick={() => setDeliveryType("file")}
              >
                Deliver a file
              </Button>
            </div>

            {deliveryType === "file" && (
              <div className="pt-2">
                {fileMeta ? (
                  <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 p-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{fileMeta.fileName}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatBytes(fileMeta.sizeBytes)}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                      >
                        Replace
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setFileMeta(null)}
                        disabled={uploading}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Uploading…
                      </>
                    ) : (
                      <>
                        <Upload className="h-3.5 w-3.5" />
                        Choose file
                      </>
                    )}
                  </Button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFilePick}
                />
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  Up to 250 MB. The buyer gets a secure download link by
                  email — the file itself is never public.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || uploading}>
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : editing ? (
                "Save"
              ) : (
                "Create"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatPrice(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}
