import Link from "next/link";
import ThemeToggle from "@/components/theme-toggle";

export default function AccountLink({ email }: { email: string }) {
  return (
    <>
      <ThemeToggle />
      <Link className="account-link" href="/profile" aria-label={`My profile (${email})`}>
        <span className="account-email">{email}</span>
        <span className="avatar">{email.charAt(0).toUpperCase()}</span>
      </Link>
    </>
  );
}
