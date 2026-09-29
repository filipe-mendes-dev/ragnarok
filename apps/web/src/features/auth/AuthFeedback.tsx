interface AuthFeedbackProps {
    message: string | null;
}

export function AuthFeedback({ message }: AuthFeedbackProps) {
    return (
        <div className="flex h-16 items-center overflow-y-auto">
            {message ? (
                <p
                    className="w-full rounded-control border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
                    role="alert"
                >
                    {message}
                </p>
            ) : null}
        </div>
    );
}
