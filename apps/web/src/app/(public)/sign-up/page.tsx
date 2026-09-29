import { AuthPageShell } from "@/features/auth/AuthPageShell";
import { SignUpForm } from "@/features/auth/SignUpForm";

export default function SignUpPage() {
    return (
        <AuthPageShell
            description="Create an account to start building a private document collection."
            title="Create your account"
        >
            <SignUpForm />
        </AuthPageShell>
    );
}
