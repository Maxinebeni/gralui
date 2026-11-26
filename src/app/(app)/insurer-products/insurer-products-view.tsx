"use client";

import { useCallback, useEffect, useState } from "react";
import { ActionForm, Label, SelectInput, TextInput } from "@/components/gral/onboarding-ui";
import { PageHeader } from "@/components/gral/shell";
import { FloatCard, Loader, OutlineButton } from "@/components/gral/ui";
import { addCatalogProduct, addCatalogProductLine, addInsurer, getInsurerProductCatalog, linkProductsToInsurer, productsAvailableToLink, reloadInsurerProductLinks, renameCatalogProduct, renameInsurer, unlinkProductFromInsurer, type InsurerProductCatalog } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import { hasPermission, usesBackendPermissions } from "@/lib/permissions";

export function InsurerProductsView() {
  const [catalog, setCatalog] = useState<InsurerProductCatalog | null>(null);
  const [section, setSection] = useState<"insurers" | "products">("insurers");
  const [selectedInsurerId, setSelectedInsurerId] = useState("");
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [availableProducts, setAvailableProducts] = useState<{ id: string; name: string; termCode: string; classCode: "LIFE" | "NON_LIFE" }[]>([]);
  const [availableProductsLoading, setAvailableProductsLoading] = useState(false);
  const [availableProductsError, setAvailableProductsError] = useState<string | null>(null);
  const [unlinkingProductId, setUnlinkingProductId] = useState("");
  const [unlinkReason, setUnlinkReason] = useState("");
  const [renamingInsurerId, setRenamingInsurerId] = useState("");
  const [renamingProductId, setRenamingProductId] = useState("");
  const [renameName, setRenameName] = useState("");
  const [renameReason, setRenameReason] = useState("");
  const [showAddInsurer, setShowAddInsurer] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [insurerCode, setInsurerCode] = useState("");
  const [insurerName, setInsurerName] = useState("");
  const [insurerTypeCode, setInsurerTypeCode] = useState("");
  const [insurerReason, setInsurerReason] = useState("");
  const [productCode, setProductCode] = useState("");
  const [productName, setProductName] = useState("");
  const [productNotes, setProductNotes] = useState("");
  const [productClassCode, setProductClassCode] = useState<"LIFE" | "NON_LIFE">("NON_LIFE");
  const productTermCode = productClassCode === "LIFE" ? "LONG_TERM" : "SHORT_TERM";
  const [productLineCodes, setProductLineCodes] = useState<string[]>([]);
  const [productReason, setProductReason] = useState("");
  const [showAddProductLine, setShowAddProductLine] = useState(false);
  const [productLineCode, setProductLineCode] = useState("");
  const [productLineName, setProductLineName] = useState("");
  const [productLineReason, setProductLineReason] = useState("");
  const [productLineError, setProductLineError] = useState<string | null>(null);
  const [creatingProductLine, setCreatingProductLine] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryingInsurerIds, setRetryingInsurerIds] = useState<Set<string>>(() => new Set());
  const { user } = useCurrentUser();
  const canAddProduct = usesBackendPermissions(user) ? hasPermission(user, "PRODUCT_REFERENCE_UPDATE") : user.role === "GI Underwriting Manager";
  const canRenameInsurer = usesBackendPermissions(user) ? hasPermission(user, "INSURER_REFERENCE_UPDATE") : user.role === "GI Underwriting Manager";
  const canRenameProduct = usesBackendPermissions(user) ? hasPermission(user, "PRODUCT_REFERENCE_UPDATE") : user.role === "GI Underwriting Manager";

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const next = await getInsurerProductCatalog();
      setCatalog(next);
      setLoadError(null);
      setSelectedInsurerId((current) => next.insurers.some((insurer) => insurer.id === current) ? current : next.insurers[0]?.id ?? "");
      setInsurerTypeCode((current) => current || next.insurerTypes.find((type) => type.code === "NON_LIFE")?.code || next.insurerTypes[0]?.code || "");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load the insurer product catalog.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const retryInsurerProducts = async (insurerId: string, insurerName: string) => {
    setRetryingInsurerIds((current) => new Set(current).add(insurerId));
    try {
      const ids = await reloadInsurerProductLinks(insurerId, insurerName);
      setCatalog((current) => {
        if (!current) return current;
        const linkedProductErrors = Object.fromEntries(Object.entries(current.linkedProductErrors).filter(([id]) => id !== insurerId));
        return { ...current, linkedProductIds: { ...current.linkedProductIds, [insurerId]: ids }, linkedProductErrors };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : `Could not load products for ${insurerName}.`;
      setCatalog((current) => current ? { ...current, linkedProductErrors: { ...current.linkedProductErrors, [insurerId]: message } } : current);
    } finally {
      setRetryingInsurerIds((current) => {
        const next = new Set(current);
        next.delete(insurerId);
        return next;
      });
    }
  };

  const selectedInsurer = catalog?.insurers.find((insurer) => insurer.id === selectedInsurerId);
  const selectedInsurerError = selectedInsurer ? catalog?.linkedProductErrors[selectedInsurer.id] : undefined;
  const linkedIds = catalog?.linkedProductIds[selectedInsurerId] ?? [];
  const linkedProducts = catalog?.products.filter((product) => linkedIds.includes(product.id)) ?? [];
  const loadAvailableProducts = async (insurer: NonNullable<typeof selectedInsurer>) => {
    setAvailableProductsLoading(true);
    setAvailableProductsError(null);
    setAvailableProducts([]);
    try {
      setAvailableProducts(await productsAvailableToLink(insurer.id, insurer.typeCode as "LIFE" | "NON_LIFE", insurer.name));
    } catch (error) {
      setAvailableProductsError(error instanceof Error ? error.message : `Could not load compatible products for ${insurer.name}.`);
    } finally {
      setAvailableProductsLoading(false);
    }
  };
  const availableProductLines = catalog?.productLines.filter((line) => line.termCode === productTermCode) ?? [];

  const createProductLine = async () => {
    setProductLineError(null);
    setCreatingProductLine(true);
    try {
      const code = productLineCode.trim();
      await addCatalogProductLine({ code, name: productLineName, termCode: productTermCode, reason: productLineReason });
      await load(false);
      setProductLineCodes((current) => [...new Set([...current, code])]);
      setProductLineCode(""); setProductLineName(""); setProductLineReason(""); setShowAddProductLine(false);
    } catch (error) {
      setProductLineError(error instanceof Error ? error.message : "Could not add the product line.");
    } finally {
      setCreatingProductLine(false);
    }
  };

  return (
    <>
      <PageHeader title="Insurer products" subtitle="View insurers and manage the products they offer." />
      {loadError ? (
        <FloatCard className="mt-5 p-5">
          <p role="alert" className="text-sm text-danger">{loadError}</p>
          <button type="button" onClick={() => void load()} className="mt-3 text-xs font-medium text-primary underline underline-offset-2">Try again</button>
        </FloatCard>
      ) : loading || !catalog ? (
        <FloatCard className="mt-5 p-5"><p className="text-sm text-muted-foreground"><Loader label="Loading insurer product catalog" /></p></FloatCard>
      ) : (
        <div className="mt-5 space-y-3 sm:space-y-4">
          <div role="tablist" aria-label="Catalog management" className="inline-flex rounded-full bg-muted p-1">
            <button type="button" role="tab" aria-selected={section === "insurers"} onClick={() => setSection("insurers")} className={`rounded-full px-4 py-2 text-sm ${section === "insurers" ? "bg-background font-medium text-primary" : "text-muted-foreground"}`}>Insurers</button>
            <button type="button" role="tab" aria-selected={section === "products"} onClick={() => setSection("products")} className={`rounded-full px-4 py-2 text-sm ${section === "products" ? "bg-background font-medium text-primary" : "text-muted-foreground"}`}>Products</button>
          </div>
          {section === "insurers" ? <>
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
                  <SelectInput id="insurer-type" label="Insurance type" value={insurerTypeCode} onChange={setInsurerTypeCode} options={catalog.insurerTypes.filter((type) => type.code === "LIFE" || type.code === "NON_LIFE").map((type) => ({ value: type.code, label: type.code === "LIFE" ? "Life" : "Non-life" }))} wide />
                  <TextInput id="insurer-reason" label="Reason for adding the insurer" value={insurerReason} onChange={setInsurerReason} multiline wide />
                </ActionForm>
              </div>
            ) : null}
            <div className="mt-4 overflow-x-auto">
              <table className="stack-table w-full min-w-[720px] border-separate border-spacing-0 text-left">
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
                    const productsError = catalog.linkedProductErrors[insurer.id];
                    return (
                      <tr key={insurer.id} className={selectedInsurerId === insurer.id ? "bg-muted/30" : ""}>
                        <td className="border-b border-border px-3 py-3 text-sm font-medium">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{insurer.name}</span>
                            {canRenameInsurer ? <OutlineButton onClick={() => { setRenamingInsurerId(insurer.id); setRenameName(insurer.name); setRenameReason(""); }} className="px-2.5 py-1 text-xs">Rename</OutlineButton> : null}
                          </div>
                        </td>
                        <td data-label="Type" className="border-b border-border px-3 py-3 text-sm text-muted-foreground">{insurerType?.name ?? insurer.typeCode}</td>
                        <td data-label="Products" className="border-b border-border px-3 py-3 text-sm text-muted-foreground">
                          {productsError ? (
                            <div className="flex flex-wrap items-center gap-2" title={productsError}>
                              <span role="status" className="text-danger">Products unavailable</span>
                              <OutlineButton disabled={retryingInsurerIds.has(insurer.id)} onClick={() => void retryInsurerProducts(insurer.id, insurer.name)} className="px-2.5 py-1 text-xs">
                                {retryingInsurerIds.has(insurer.id) ? "Retrying…" : "Retry"}
                              </OutlineButton>
                            </div>
                          ) : products.length ? products.map((product) => product.name).join(", ") : "No products linked"}
                        </td>
                        <td className="border-b border-border px-3 py-3">
                          <OutlineButton onClick={() => { setSelectedInsurerId(insurer.id); setUnlinkingProductId(""); setSelectedProductIds([]); setIsDetailsOpen(true); void loadAvailableProducts(insurer); }} className="px-3 py-1.5 text-xs">
                            Manage products
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
          </> : <FloatCard className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold tracking-tight">Product catalog</h2>
                <p className="mt-1 text-xs text-muted-foreground">Add or rename products here. Link and remove products from an insurer in the Insurers section.</p>
              </div>
              {canAddProduct ? <OutlineButton onClick={() => setShowAddProduct((current) => !current)} className="px-3 py-2 text-xs">{showAddProduct ? "Close form" : "Add product"}</OutlineButton> : null}
            </div>
            {showAddProduct && canAddProduct ? <div className="mt-4 max-w-3xl">
              <ActionForm
                title="Add a product to the catalog"
                submitLabel="Create product"
                success="Product added to catalog. Link it to insurers from the Insurers section."
                onCancel={() => setShowAddProduct(false)}
                onSubmit={async () => {
                  await addCatalogProduct({ code: productCode, name: productName, notes: productNotes, termCode: productTermCode, productLineCodes, reason: productReason });
                  setProductCode(""); setProductName(""); setProductNotes(""); setProductLineCodes([]); setProductReason(""); setShowAddProduct(false);
                  await load(false);
                }}
              >
                <TextInput id="product-code" label="Product code" value={productCode} onChange={setProductCode} placeholder="e.g. MOTOR_FLEET" />
                <TextInput id="product-name" label="Product name" value={productName} onChange={setProductName} />
                <SelectInput id="product-class" label="Insurance type" value={productClassCode} onChange={(value) => { setProductClassCode(value as "LIFE" | "NON_LIFE"); setProductLineCodes([]); }} options={[{ value: "LIFE", label: "Life" }, { value: "NON_LIFE", label: "Non-life" }]} wide />
                <TextInput id="product-notes" label="Notes (optional)" value={productNotes} onChange={setProductNotes} multiline wide />
                <div className="space-y-2 sm:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label>Product lines</Label>
                    {canAddProduct ? <button type="button" onClick={() => { setProductLineError(null); setShowAddProductLine((current) => !current); }} className="text-xs font-medium text-primary underline underline-offset-2">{showAddProductLine ? "Cancel new line" : "Create product line"}</button> : null}
                  </div>
                  {availableProductLines.length ? availableProductLines.map((line) => (
                    <label key={line.code} className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={productLineCodes.includes(line.code)} onChange={(event) => setProductLineCodes((current) => event.target.checked ? [...current, line.code] : current.filter((code) => code !== line.code))} />
                      {line.name}
                    </label>
                  )) : !showAddProductLine ? <p className="text-xs text-muted-foreground">No active product lines exist for this term.</p> : null}
                  {showAddProductLine ? <div className="mt-2 space-y-3 rounded-xl border border-border bg-muted/30 p-3">
                    <p className="text-xs font-medium">New line for {catalog.productTerms.find((term) => term.code === productTermCode)?.name ?? productTermCode}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <TextInput id="product-line-code" label="Product line code" value={productLineCode} onChange={setProductLineCode} placeholder="e.g. MOTOR" />
                      <TextInput id="product-line-name" label="Product line name" value={productLineName} onChange={setProductLineName} />
                      <TextInput id="product-line-reason" label="Reason for adding this line" value={productLineReason} onChange={setProductLineReason} multiline wide />
                    </div>
                    {productLineError ? <p role="alert" className="text-xs text-danger">{productLineError}</p> : null}
                    <OutlineButton type="button" disabled={creatingProductLine || !productTermCode} onClick={() => void createProductLine()} className="px-3 py-1.5 text-xs">{creatingProductLine ? "Creating…" : "Create and select line"}</OutlineButton>
                  </div> : null}
                </div>
                <TextInput id="product-reason" label="Reason for adding the product" value={productReason} onChange={setProductReason} multiline wide />
              </ActionForm>
            </div> : null}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[620px] border-separate border-spacing-0 text-left">
                <thead><tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="border-b border-border px-3 py-2 font-medium">Product</th>
                  <th className="border-b border-border px-3 py-2 font-medium">Insurance type</th>
                  <th className="border-b border-border px-3 py-2 font-medium">Offered by</th>
                  <th className="border-b border-border px-3 py-2 font-medium">Action</th>
                </tr></thead>
                <tbody>
                  {catalog.products.map((product) => {
                    const linkedInsurers = catalog.insurers.filter((insurer) => catalog.linkedProductIds[insurer.id]?.includes(product.id));
                    const hasUnknownLinks = catalog.insurers.some((insurer) => Boolean(catalog.linkedProductErrors[insurer.id]));
                    return <tr key={product.id}>
                      <td className="border-b border-border px-3 py-3 text-sm font-medium">{product.name}</td>
                      <td className="border-b border-border px-3 py-3 text-sm text-muted-foreground">{product.classCode === "LIFE" ? "Life" : "Non-life"}</td>
                      <td className="border-b border-border px-3 py-3 text-sm text-muted-foreground">{linkedInsurers.length ? linkedInsurers.map((insurer) => insurer.name).join(", ") : hasUnknownLinks ? "Some insurer links unavailable" : "Not linked"}</td>
                      <td className="border-b border-border px-3 py-3">{canRenameProduct ? <OutlineButton onClick={() => { setRenamingProductId(product.id); setRenameName(product.name); setRenameReason(""); }} className="px-3 py-1.5 text-xs">Rename</OutlineButton> : <span className="text-xs text-muted-foreground">—</span>}</td>
                    </tr>;
                  })}
                  {!catalog.products.length ? <tr><td colSpan={4} className="px-3 py-8 text-center text-sm text-muted-foreground">No active products found. Add a product to get started.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </FloatCard>}

          {renamingInsurerId ? (() => {
            const insurer = catalog.insurers.find((item) => item.id === renamingInsurerId);
            if (!insurer) return null;
            return (
              <div className="fixed inset-0 z-[70] flex items-end justify-center bg-foreground/40 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setRenamingInsurerId(""); }}>
                <div role="dialog" aria-modal="true" aria-labelledby="rename-insurer-title" className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-background p-4 shadow-2xl sm:rounded-2xl sm:p-6">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Insurer catalog</p>
                      <h2 id="rename-insurer-title" className="mt-1 text-lg font-semibold">Rename insurer</h2>
                    </div>
                    <OutlineButton onClick={() => setRenamingInsurerId("")} className="px-3 py-1.5 text-xs">Close</OutlineButton>
                  </div>
                  <ActionForm
                    submitLabel="Save insurer name"
                    success="Insurer name updated."
                    onCancel={() => setRenamingInsurerId("")}
                    onSubmit={async () => {
                      await renameInsurer(insurer.id, { expectedVersion: insurer.version, name: renameName, reason: renameReason });
                      setRenamingInsurerId(""); setRenameName(""); setRenameReason("");
                      await load(false);
                    }}
                  >
                    <TextInput id="rename-insurer-name" label="Insurer name" value={renameName} onChange={setRenameName} wide />
                    <TextInput id="rename-insurer-reason" label="Reason for renaming" value={renameReason} onChange={setRenameReason} multiline wide />
                  </ActionForm>
                </div>
              </div>
            );
          })() : null}

          {selectedInsurer && isDetailsOpen ? (
            <div className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/40 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsDetailsOpen(false); }}>
            <div role="dialog" aria-modal="true" aria-labelledby="insurer-details-title" className="max-h-[92dvh] w-full max-w-4xl overflow-y-auto rounded-t-2xl bg-background p-4 shadow-2xl sm:rounded-2xl sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Insurer product setup</p>
                  <h2 id="insurer-details-title" className="mt-1 text-lg font-semibold">Manage products · {selectedInsurer.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Link compatible products to this insurer or remove products it no longer offers.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">{selectedInsurerError ? "Products unavailable" : `${linkedProducts.length} linked ${linkedProducts.length === 1 ? "product" : "products"}`}</span>
                  <OutlineButton onClick={() => setIsDetailsOpen(false)} className="px-3 py-1.5 text-xs">Close</OutlineButton>
                </div>
              </div>
              <div className="mt-5 rounded-xl bg-muted/40 p-4">
                <h3 className="text-sm font-semibold">Add a product</h3>
                <p className="mt-1 text-xs text-muted-foreground">Only products compatible with this insurer’s insurance type are listed.</p>
                {selectedInsurerError ? (
                  <p className="mt-3 text-xs text-muted-foreground">Retry loading this insurer’s products before changing its product links.</p>
                ) : availableProductsLoading ? <p className="mt-3 text-sm text-muted-foreground">Loading compatible products…</p>
                : availableProductsError ? <div className="mt-3 flex flex-wrap items-center gap-3">
                  <p role="alert" className="text-sm text-danger">{availableProductsError}</p>
                  <OutlineButton onClick={() => void loadAvailableProducts(selectedInsurer)} className="px-3 py-1.5 text-xs">Retry</OutlineButton>
                </div>
                : availableProducts.length ? <ActionForm
                  submitLabel={`Link ${selectedProductIds.length || "selected"} product${selectedProductIds.length === 1 ? "" : "s"}`}
                  success="Selected products linked to insurer."
                  disabled={!selectedProductIds.length}
                  disabledReason={!selectedProductIds.length ? "Select one or more compatible products." : undefined}
                  onSubmit={async () => {
                    await linkProductsToInsurer(selectedInsurer.id, selectedProductIds);
                    setSelectedProductIds([]);
                    await loadAvailableProducts(selectedInsurer);
                    await load(false);
                  }}
                >
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Compatible products</Label>
                    <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border bg-background p-3">
                      {availableProducts.map((product) => <label key={product.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted/50">
                        <input type="checkbox" checked={selectedProductIds.includes(product.id)} onChange={(event) => setSelectedProductIds((current) => event.target.checked ? [...current, product.id] : current.filter((id) => id !== product.id))} />
                        <span>{product.name}</span>
                      </label>)}
                    </div>
                    <p className="text-xs text-muted-foreground">{selectedProductIds.length} selected. Only active {selectedInsurer.typeCode === "LIFE" ? "Life" : "Non-life"} products not already linked are shown.</p>
                  </div>
                </ActionForm> : <div className="mt-3 rounded-lg border border-border bg-background p-3">
                  <p className="text-sm">No compatible unlinked products are available.</p>
                  {canAddProduct ? <button type="button" onClick={() => { setIsDetailsOpen(false); setSection("products"); setShowAddProduct(true); }} className="mt-2 text-xs font-medium text-primary underline underline-offset-2">Create a product in the catalog</button> : null}
                </div>}
              </div>

              <section aria-label="Products linked to insurer" className="mt-5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Linked products</h3>
                  {!selectedInsurerError ? <span className="text-xs text-muted-foreground">{linkedProducts.length} linked</span> : null}
                </div>
              <div className="divide-y divide-border rounded-xl border border-border">
                {selectedInsurerError ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                    <p role="alert" className="text-sm text-danger">{selectedInsurerError}</p>
                    <OutlineButton disabled={retryingInsurerIds.has(selectedInsurer.id)} onClick={() => { void retryInsurerProducts(selectedInsurer.id, selectedInsurer.name); void loadAvailableProducts(selectedInsurer); }}>
                      {retryingInsurerIds.has(selectedInsurer.id) ? "Retrying…" : "Retry"}
                    </OutlineButton>
                  </div>
                ) : linkedProducts.length ? linkedProducts.map((product) => (
                  <div key={product.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{product.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{catalog.productTerms.find((term) => term.code === product.termCode)?.name ?? product.termCode}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {canRenameProduct ? <OutlineButton onClick={() => { setRenamingProductId(product.id); setRenameName(product.name); setRenameReason(""); }} className="px-3 py-1.5 text-xs">Rename</OutlineButton> : null}
                      <OutlineButton onClick={() => { setUnlinkingProductId(product.id); setUnlinkReason(""); }} className="px-3 py-1.5 text-xs">Remove product</OutlineButton>
                    </div>
                  </div>
                )) : <div className="px-4 py-6">
                  <p className="text-sm font-medium">No products linked yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">Use the form below to add a compatible product.</p>
                </div>}
              </div>
              </section>

              {unlinkingProductId && !selectedInsurerError ? (
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

            </div>
            </div>
          ) : null}
          {renamingProductId ? (() => {
            const product = catalog.products.find((item) => item.id === renamingProductId);
            if (!product) return null;
            return (
              <div className="fixed inset-0 z-[70] flex items-end justify-center bg-foreground/40 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setRenamingProductId(""); }}>
                <div role="dialog" aria-modal="true" aria-labelledby="rename-product-title" className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-background p-4 shadow-2xl sm:rounded-2xl sm:p-6">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Product catalog</p><h2 id="rename-product-title" className="mt-1 text-lg font-semibold">Rename product</h2></div>
                    <OutlineButton onClick={() => setRenamingProductId("")} className="px-3 py-1.5 text-xs">Close</OutlineButton>
                  </div>
                  <ActionForm
                    submitLabel="Save product name"
                    success="Product name updated."
                    onCancel={() => setRenamingProductId("")}
                    onSubmit={async () => {
                      await renameCatalogProduct(product.id, { expectedVersion: product.version, name: renameName, reason: renameReason });
                      setRenamingProductId(""); setRenameName(""); setRenameReason("");
                      await load(false);
                    }}
                  >
                    <TextInput id="rename-product-name" label="Product name" value={renameName} onChange={setRenameName} wide />
                    <TextInput id="rename-product-reason" label="Reason for renaming" value={renameReason} onChange={setRenameReason} multiline wide />
                  </ActionForm>
                </div>
              </div>
            );
          })() : null}
        </div>
      )}
    </>
  );
}
