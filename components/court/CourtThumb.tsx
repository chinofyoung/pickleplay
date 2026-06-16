import Image from "next/image";
import { Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Court hero image, used as the card thumbnail across search & pickleball court pages and
 * as the banner on the booking page. Falls back to a branded gradient when a
 * court has no image_url yet.
 */
export function CourtThumb({
  src,
  alt,
  className,
  sizes = "(max-width: 768px) 100vw, 33vw",
  priority = false,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  return (
    <div className={cn("relative aspect-video w-full overflow-hidden bg-muted", className)}>
      {src ? (
        <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center bg-gradient-to-br from-primary/30 via-surface to-cta/20">
          <Dumbbell className="size-10 text-white/40" />
        </div>
      )}
    </div>
  );
}
