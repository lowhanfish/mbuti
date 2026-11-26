import { MockOutbox } from "./_components/MockOutbox";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-shell min-h-screen flex flex-col">
      {children}
      <MockOutbox />
    </div>
  );
}
