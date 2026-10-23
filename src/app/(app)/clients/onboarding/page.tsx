import { redirect } from "next/navigation";

// The page was renamed to Leads; old links still land in the right place.
export default async function OldOnboardingPage({ searchParams }: { searchParams: Promise<{ case?: string }> }) {
  const { case: id } = await searchParams;
  redirect(id ? `/clients/leads/${encodeURIComponent(id)}` : "/clients/leads");
}
