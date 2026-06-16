import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import RegisterTabs from "./RegisterTabs";

interface RegisterPageProps {
  searchParams: Promise<{ error?: string; tab?: string }>;
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const { error, tab } = await searchParams;

  return (
    <>
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <Image
          src="/assets/register.png"
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-background/80" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/40" />
      </div>
      <div className="relative z-10 w-full max-w-3xl">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-text-muted transition-colors hover:text-primary"
        >
          <ArrowLeft className="size-4" />
          Back to homepage
        </Link>
        <RegisterTabs
          error={error}
          defaultTab={tab === "owner" ? "owner" : "player"}
        />
      </div>
    </>
  );
}
