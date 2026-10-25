"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ActionForm, Label, SelectInput, TextInput } from "@/components/gral/onboarding-ui";
import { PageHeader } from "@/components/gral/shell";
import { FloatCard, OutlineButton } from "@/components/gral/ui";
import { addCatalogProduct, addInsurer, getInsurerProductCatalog, linkProductToInsurer, unlinkProductFromInsurer, type InsurerProductCatalog } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import { hasPermission, usesBackendPermissions } from "@/lib/permissions";

export function InsurerProductsView() {
  const [catalog, setCatalog] = useState<InsurerProductCatalog | null>(null);
  const [selectedInsurerId, setSelectedInsurerId] = useState("");
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [linkReason, setLinkReason] = useState("");
  const [unlinkingProductId, setUnlinkingProductId] = useState("");
  const [unlinkReason, setUnlinkReason] = useState("");
  const [showAddInsurer, setShowAddInsurer] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [insurerCode, setInsurerCode] = useState("");
  const [insurerName, setInsurerName] = useState("");
  const [insurerTypeCode, setInsurerTypeCode] = useState("");
  const [insurerReason, setInsurerReason] = useState("");
  const [productCode, setProductCode] = useState("");
  const [productName, setProductName] = useState("");
  const [productNotes, setProductNotes] = useState("");
  const [productTermCode, setProductTermCode] = useState("");
  const [productLineCodes, setProductLineCodes] = useState<string[]>([]);
  const [productReason, setProductReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { user } = useCurrentUser();
  const canAddProduct = usesBackendPermissions(user) ? hasPermission(user, "PRODUCT_REFERENCE_UPDATE") : user.role === "GI Underwriting Manager";

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const next = await getInsurerProductCatalog();
      setCatalog(next);
      setLoadError(null);
      setSelectedInsurerId((current) => next.insurers.some((insurer) => insurer.id === current) ? current : next.insurers[0]?.id ?? "");
      setInsurerTypeCode((current) => current || next.insurerTypes[0]?.code || "");
      setProductTermCode((current) => current || next.productTerms[0]?.code || "");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load the insurer product catalog.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selectedInsurer = catalog?.insurers.find((insurer) => insurer.id === selectedInsurerId);
  const linkedIds = catalog?.linkedProductIds[selectedInsurerId] ?? [];
  const linkedProducts = catalog?.products.filter((product) => linkedIds.includes(product.id)) ?? [];
  const availableProducts = useMemo(() => catalog?.products.filter((product) =>
    selectedInsurer?.supportedTermCodes.includes(product.termCode) && !linkedIds.includes(product.id),
  ) ?? [], [catalog, selectedInsurer, linkedIds]);
  const availableProductLines = catalog?.productLines.filter((line) => line.termCode === productTermCode) ?? [];

  return (
    <>
      <PageHeader title="Insurer products" subtitle="View insurers and manage the products they offer." />
      {loadError ? (
        <FloatCard className="mt-5 p-5">
          <p role="alert" className="text-sm text-danger">{loadError}</p>
          <button type="button" onClick={() => void load()} className="mt-3 text-xs font-medium text-primary underline underline-offset-2">Try again</button>
        </FloatCard>
      ) : loading || !catalog ? (
        <FloatCard className="mt-5 p-5"><p className="text-sm text-muted-foreground">Loading insurer product catalog…</p></FloatCard>
      ) : (
        <div className="mt-5 space-y-4">
          <FloatCard className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold tracking-tight">Insurers</h2>
                <p className="mt-1 text-xs text-muted-foreground">Select an insurer to view and manage its product links.</p>
              </div>
              <OutlineButton onClick={() => setShowAddInsurer((current) => !current)} className="px-3 py-2 text-xs">
                {showAddInsurer ? "Cancel" : "Add insurer"}
              </OutlineButton>
            </div>
            {showAddInsurer ? (
              <div className="mt-4 max-w-3xl">
                <ActionForm
                  title="Add an insurer"
                  submitLabel="Add insurer"
                  success="Insurer added."
                  onCancel={() => setShowAddInsurer(false)}
                  onSubmit={async () => {
                    await addInsurer({ code: insurerCode, name: insurerName, typeCode: insurerTypeCode, reason: insurerReason });
                    setInsurerCode(""); setInsurerName(""); setInsurerReason(""); setShowAddInsurer(false);
                    await load(false);
                  }}
                >
                  <TextInput id="insurer-code" label="Insurer code" value={insurerCode} onChange={setInsurerCode} placeholder="e.g. ACME_INSURANCE" />
                  <TextInput id="insurer-name" label="Insurer name" value={insurerName} onChange={setInsurerName} />
                  <SelectInput id="insurer-type" label="Insurer type" value={insurerTypeCode} onChange={setInsurerTypeCode} options={catalog.insurerTypes.map((type) => ({ value: type.code, label: type.name }))} wide />
                  <TextInput id="insurer-reason" label="Reason for adding the insurer" value={insurerReason} onChange={setInsurerReason} multiline wide />
                </ActionForm>
              </div>
            ) : null}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="border-b border-border px-3 py-2 font-medium">Insurer</th>
                    <th className="border-b border-border px-3 py-2 font-medium">Type</th>
                    <th className="border-b border-border px-3 py-2 font-medium">Products</th>
                    <th className="border-b border-border px-3 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.insurers.map((insurer) => {
                    const products = catalog.products.filter((product) => catalog.linkedProductIds[insurer.id]?.includes(product.id));
                    const insurerType = catalog.insurerTypes.find((type) => type.code === insurer.typeCode);
                    return (
                      <tr key={insurer.id} className={selectedInsurerId === insurer.id ? "bg-muted/30" : ""}>
                        <td className="border-b border-border px-3 py-3 text-sm font-medium">{insurer.name}</td>
                        <td className="border-b border-border px-3 py-3 text-sm text-muted-foreground">{insurerType?.name ?? insurer.typeCode}</td>
                        <td className="border-b border-border px-3 py-3 text-sm text-muted-foreground">
                          {products.length ? products.map((product) => product.name).join(", ") : "No products linked"}
                        </td>
                        <td className="border-b border-border px-3 py-3">
                          <OutlineButton onClick={() => { setSelectedInsurerId(insurer.id); setUnlinkingProductId(""); setSelectedProductId(""); setIsDetailsOpen(true); }} className="px-3 py-1.5 text-xs">
                            View products
                          </OutlineButton>
                        </td>
                      </tr>
                    );
                  })}
                  {!catalog.insurers.length ? <tr><td colSpan={4} className="px-3 py-8 text-center text-sm text-muted-foreground">No active insurers found. Add an insurer to get started.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </FloatCard>

          {selectedInsurer && isDetailsOpen ? (
            <div className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/40 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsDetailsOpen(false); }}>
            <div role="dialog" aria-modal="true" aria-labelledby="insurer-details-title" className="max-h-[92dvh] w-full max-w-4xl overflow-y-auto rounded-t-2xl bg-background p-4 shadow-2xl sm:rounded-2xl sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Insurer details</p>
                  <h2 id="insurer-details-title" className="mt-1 text-lg font-semibold">{selectedInsurer.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{catalog.insurerTypes.find((type) => type.code === selectedInsurer.typeCode)?.name ?? selectedInsurer.typeCode}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">{linkedProducts.length} linked {linkedProducts.length === 1 ? "product" : "products"}</span>
                  <OutlineButton onClick={() => setIsDetailsOpen(false)} className="px-3 py-1.5 text-xs">Close</OutlineButton>
                </div>
              </div>
              <div className="mt-4 divide-y divide-border rounded-xl border border-border">
                {linkedProducts.length ? linkedProducts.map((product) => (
                  <div key={product.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{product.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{catalog.productTerms.find((term) => term.code === product.termCode)?.name ?? product.termCode}</p>
                    </div>
                    <OutlineButton onClick={() => { setUnlinkingProductId(product.id); setUnlinkReason(""); }} className="px-3 py-1.5 text-xs">Remove product</OutlineButton>
                  </div>
                )) : <p className="px-4 py-6 text-sm text-muted-foreground">No products are linked to this insurer yet.</p>}
              </div>

              {unlinkingProductId ? (
                <div className="mt-3 max-w-3xl">
                  <ActionForm
                    title={`Remove ${catalog.products.find((product) => product.id === unlinkingProductId)?.name ?? "product"} from ${selectedInsurer.name}`}
                    submitLabel="Remove product"
                    success="Product removed from insurer."
                    onCancel={() => setUnlinkingProductId("")}
                    onSubmit={async () => {
                      await unlinkProductFromInsurer(selectedInsurer.id, unlinkingProductId, unlinkReason);
                      setUnlinkingProductId("");
                      await load(false);
                    }}
                  >
                    <TextInput id="unlink-reason" label="Reason for removal" value={unlinkReason} onChange={setUnlinkReason} multiline wide />
                  </ActionForm>
                </div>
              ) : null}

              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold">Add an existing product</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Only products supported by this insurer’s insurance type are available.</p>
                  <ActionForm
                    submitLabel="Link product"
                    success="Product linked to insurer."
                    onSubmit={async () => {
                      if (!selectedProductId) throw new Error("Choose a product.");
                      await linkProductToInsurer(selectedInsurer.id, selectedProductId, linkReason);
                      setSelectedProductId(""); setLinkReason("");
                      await load(false);
                    }}
                  >
                    <SelectInput id="catalog-product" label="Product" value={selectedProductId} onChange={setSelectedProductId} placeholder="Select a compatible product" options={availableProducts.map((product) => ({ value: product.id, label: product.name }))} wide />
                    {!availableProducts.length ? <p className="text-xs text-muted-foreground sm:col-span-2">No compatible unlinked products are available.</p> : null}
                    <TextInput id="catalog-reason" label="Reason for linking" value={linkReason} onChange={setLinkReason} multiline wide />
                  </ActionForm>
                </div>
                {canAddProduct ? (
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold">Create a new product</h3>
                        <p className="mt-1 text-xs text-muted-foreground">Create it in the catalog, then link it to this insurer.</p>
                      </div>
                      <OutlineButton onClick={() => setShowAddProduct((current) => !current)} className="px-3 py-1.5 text-xs">{showAddProduct ? "Hide" : "Add product"}</OutlineButton>
                    </div>
                    {showAddProduct ? (
                      <div className="mt-3">
                        <ActionForm
                          submitLabel="Create product"
                          success="Product added to catalog. You can now link it to this insurer."
                          onSubmit={async () => {
                            await addCatalogProduct({ code: productCode, name: productName, notes: productNotes, termCode: productTermCode, productLineCodes, reason: productReason });
                            setProductCode(""); setProductName(""); setProductNotes(""); setProductLineCodes([]); setProductReason("");
                            await load(false);
                          }}
                        >
                          <TextInput id="product-code" label="Product code" value={productCode} onChange={setProductCode} placeholder="e.g. MOTOR_FLEET" />
                          <TextInput id="product-name" label="Product name" value={productName} onChange={setProductName} />
                          <SelectInput id="product-term" label="Product term" value={productTermCode} onChange={(value) => { setProductTermCode(value); setProductLineCodes([]); }} options={catalog.productTerms.map((term) => ({ value: term.code, label: term.name }))} wide />
                          <TextInput id="product-notes" label="Notes (optional)" value={productNotes} onChange={setProductNotes} multiline wide />
                          <div className="space-y-2 sm:col-span-2">
                            <Label>Product lines</Label>
                            {availableProductLines.length ? availableProductLines.map((line) => (
                              <label key={line.code} className="flex items-center gap-2 text-xs">
                                <input type="checkbox" checked={productLineCodes.includes(line.code)} onChange={(event) => setProductLineCodes((current) => event.target.checked ? [...current, line.code] : current.filter((code) => code !== line.code))} />
                                {line.name}
                              </label>
                            )) : <p className="text-xs text-muted-foreground">No active product lines exist for this term.</p>}
                          </div>
                          <TextInput id="product-reason" label="Reason for adding the product" value={productReason} onChange={setProductReason} multiline wide />
                        </ActionForm>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
