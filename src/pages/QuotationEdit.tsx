// src/pages/QuotationEdit.tsx
import { useParams } from "react-router-dom";
import Layout from "../components/layout/Layout";

export default function QuotationEdit() {
  const { id } = useParams<{ id: string }>();
  return (
    <Layout>
      <div style={{ padding: 24 }}>
        <h2>Edit Quotation</h2>
        <p><strong>Quotation ID:</strong> {id}</p>
        <p>This is a placeholder edit page — hook up the edit form to the API.</p>
      </div>
    </Layout>
  );
}