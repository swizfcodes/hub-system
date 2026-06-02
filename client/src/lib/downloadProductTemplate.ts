import { api } from "@services/api";

export async function downloadProductTemplate() {
  const response = await api.get("/catalogue/products/import-template", {
    responseType: "blob",
  });
  const url = URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.download = "orika_product_import_template.xlsx";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
