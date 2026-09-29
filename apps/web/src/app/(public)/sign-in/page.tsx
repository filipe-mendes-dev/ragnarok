import { AuthPageShell } from "@/features/auth/AuthPageShell";
import { SignInForm } from "@/features/auth/SignInForm";

export default function SignInPage() {
    return (
        <AuthPageShell
            description="Access your private documents and retrieval traces."
            title="Welcome back"
        >
            <SignInForm />
        </AuthPageShell>
    );
}
