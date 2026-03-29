"use client";

import { useRouter } from "next/navigation";
import SignInPage from "@/app/components/auth/SignInPage";

export default function SignInRoutePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#080809]">
      <SignInPage
        onSignIn={() => {
          router.replace("/");
          router.refresh();
        }}
      />
    </div>
  );
}
