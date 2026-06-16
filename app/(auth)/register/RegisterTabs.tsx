"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { signUp, signInWithGoogle, signUpOwner } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const LocationPicker = dynamic(
  () => import("@/components/maps/LocationPicker"),
  { ssr: false }
);

interface RegisterTabsProps {
  error?: string;
  defaultTab?: "player" | "owner";
}

export default function RegisterTabs({
  error,
  defaultTab = "player",
}: RegisterTabsProps) {
  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <TabsList className="grid w-full grid-cols-2 mb-4 group-data-horizontal/tabs:h-10">
        <TabsTrigger value="player">Player</TabsTrigger>
        <TabsTrigger value="owner">Owner</TabsTrigger>
      </TabsList>

      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle>
            <h1 className="text-2xl text-primary">Create your account</h1>
          </CardTitle>
          <CardDescription>
            Join PicklePlay and start booking courts
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {error && (
            <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {decodeURIComponent(error)}
            </div>
          )}

      {/* Player Tab */}
      <TabsContent value="player">
        <div className="max-w-sm mx-auto md:max-w-md flex flex-col gap-4">
          {/* Google sign-up */}
          <form action={signInWithGoogle}>
            <Button type="submit" variant="outline" className="w-full gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="size-4 shrink-0"
                aria-hidden="true"
              >
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Sign up with Google
            </Button>
          </form>

          {/* Divider */}
          <div className="relative">
            <div className="border-t border-border" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
              or continue with email
            </span>
          </div>

          {/* Email/password sign-up */}
          <form action={signUp} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="player_full_name">Full name</Label>
              <Input
                id="player_full_name"
                name="full_name"
                type="text"
                placeholder="Jane Smith"
                required
                autoComplete="name"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="player_email">Email</Label>
              <Input
                id="player_email"
                name="email"
                type="email"
                placeholder="jane@example.com"
                required
                autoComplete="email"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="player_password">Password</Label>
              <Input
                id="player_password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
                autoComplete="new-password"
                minLength={6}
              />
            </div>

            <Button type="submit" className="mt-2 w-full">
              Create account
            </Button>
          </form>
        </div>
      </TabsContent>

      {/* Owner Tab */}
      <TabsContent value="owner">
        <form action={signUpOwner} className="flex flex-col gap-4">
          <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
            {/* Left column — account details */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="owner_full_name">Full name</Label>
                <Input
                  id="owner_full_name"
                  name="full_name"
                  type="text"
                  placeholder="Jane Smith"
                  required
                  autoComplete="name"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="owner_email">Email</Label>
                <Input
                  id="owner_email"
                  name="email"
                  type="email"
                  placeholder="jane@example.com"
                  required
                  autoComplete="email"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contact_number">Contact number</Label>
                <Input
                  id="contact_number"
                  name="contact_number"
                  type="tel"
                  placeholder="+63 917 123 4567"
                  required
                  autoComplete="tel"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="owner_password">Password</Label>
                <Input
                  id="owner_password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                  minLength={6}
                />
              </div>
            </div>

            {/* Right column — court details */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="court_name">Pickleball court name</Label>
                <Input
                  id="court_name"
                  name="name"
                  type="text"
                  placeholder="Ace Pickleball Court"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="court_address">Court address</Label>
                <Input
                  id="court_address"
                  name="address"
                  type="text"
                  placeholder="123 Main St, City"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Pin your location (optional)</Label>
                <LocationPicker />
              </div>

              <p className="text-xs text-muted-foreground">
                If you have multiple courts and locations, you can add them later.
              </p>
            </div>
          </div>

          <Button type="submit" className="mt-2 w-full">
            Create owner account
          </Button>
        </form>
      </TabsContent>

      <p className="mt-4 text-xs text-muted-foreground text-center">
        Already have an account?{" "}
        <a
          href="/login"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Sign in
        </a>
      </p>
        </CardContent>
      </Card>
    </Tabs>
  );
}
