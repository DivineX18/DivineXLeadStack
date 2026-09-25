"use client";

import { useEffect, useRef, useState } from "react";
import { Logo } from "./logo";

/**
 * The brand mark, with a fallback that actually happens.
 *
 * `brand.logoUrl` is a remote URL stored on the agency document, so it can
 * fail for reasons no deploy controls: the file moves, the host goes down,
 * someone pastes a URL with a typo. The navbar and the footer each rendered
 * `<img>` with no handling for that, so a bad URL showed broken-image alt
 * text reading "Ascend logo" in the top-left corner of every page on both
 * hosts. Which is what was happening: the configured logo returns 404.
 *
 * A missing logo should look like no logo, never like a broken page. On an
 * error the image is dropped and the built-in mark renders instead, which is
 * the same thing a workspace with no logo configured already gets.
 */
export function BrandLogo({
  logoUrl,
  name,
  size,
  imgClassName,
  idSuffix,
}: {
  logoUrl: string | null;
  name: string;
  size: number;
  imgClassName: string;
  idSuffix: string;
}) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement | null>(null);

  // onError alone is not enough. The <img> is server-rendered, so the browser
  // can fire its error event BEFORE React hydrates and attaches the handler,
  // and the fallback never runs. That is exactly what happened in production:
  // the mobile render recovered and the desktop one kept two broken images.
  // A finished image that decoded to nothing is a failed image, whenever the
  // event happened to fire.
  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, [logoUrl]);

  if (!logoUrl || failed) return <Logo size={size} idSuffix={idSuffix} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={logoUrl}
      alt={`${name} logo`}
      className={imgClassName}
      onError={() => setFailed(true)}
    />
  );
}
