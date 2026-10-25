import type { Metadata } from "next";
import { InsurerProductsView } from "./insurer-products-view";

export const metadata: Metadata = {
  title: "Insurer Products / GRAL Operations Platform",
  description: "Link existing products to insurers in GRAL's catalog.",
};

export default function InsurerProductsPage() {
  return <InsurerProductsView />;
}
