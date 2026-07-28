import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { resolveCustomBrand } from "@/lib/landing/resolve-brand";
import { OrganizationSchema } from "@/components/landing-custom/site-schema";
import { Navbar as CustomNavbar } from "@/components/landing-custom/navbar";
import { CTA as CustomCTA } from "@/components/landing-custom/cta";
import { Footer as CustomFooter } from "@/components/landing-custom/footer";
import { ResourceBody } from "@/components/landing-custom/resource-body";
import { RESOURCE_POSTS, getResourcePostBySlug } from "@/data/resources-posts";

export function generateStaticParams() {
  return RESOURCE_POSTS.map((p) => ({ slug: p.slug }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const post = getResourcePostBySlug(slug);
  const brand = await resolveCustomBrand();
  if (!post) return { title: `Resources — ${brand.name}` };
  return {
    title: `${post.title} — ${brand.name}`,
    description: post.metaDescription,
    openGraph: { title: post.title, description: post.metaDescription, type: "article" as const },
  };
}

export default async function ResourcePostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getResourcePostBySlug(slug);
  if (!post) notFound();

  const brand = await resolveCustomBrand();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? `https://${brand.primaryDomain}`;
  const postUrl = `${baseUrl}/resources/${post.slug}`;

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.metaDescription,
    datePublished: post.publishedAt,
    dateModified: post.publishedAt,
    author: { "@type": "Organization", name: brand.name },
    publisher: { "@type": "Organization", name: brand.name },
    mainEntityOfPage: postUrl,
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: baseUrl },
      { "@type": "ListItem", position: 2, name: "Resources", item: `${baseUrl}/resources` },
      { "@type": "ListItem", position: 3, name: post.title, item: postUrl },
    ],
  };

  return (
    <div className="flex min-h-screen flex-col">
      <OrganizationSchema brand={brand} baseUrl={baseUrl} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <CustomNavbar brand={brand} />
      <main className="flex-1">
        <article className="py-20 md:py-24">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-2xl">
              <Link href="/resources" className="text-sm text-muted-foreground hover:text-foreground">
                &larr; Back to Resources
              </Link>
              <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-primary">{post.category}</p>
              <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tighter sm:text-4xl">
                {post.title}
              </h1>
              <p className="mt-4 text-lg text-muted-foreground">{post.dek}</p>
              <p className="mt-3 text-xs text-muted-foreground">
                {new Date(post.publishedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                {" · "}
                {post.readingMinutes} min read
              </p>
            </div>

            <div className="mt-10">
              <ResourceBody blocks={post.body} />
            </div>

            <div className="mx-auto mt-16 max-w-2xl rounded-2xl border bg-card p-8 text-center">
              <h2 className="text-lg font-semibold">See it in the platform</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Read about the concept here; see how {brand.name} actually implements it.
              </p>
              <div className="mt-5">
                <Button render={<Link href="/platform" />} size="lg" className="px-6 text-base">
                  Explore the platform
                </Button>
              </div>
            </div>
          </div>
        </article>

        <CustomCTA brand={brand} />
      </main>
      <CustomFooter brand={brand} />
    </div>
  );
}
