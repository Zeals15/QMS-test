// src/pages/QuotationView.tsx
import { useParams } from "react-router-dom";
import Layout from "../components/layout/Layout";

export default function QuotationView() {
  const { id } = useParams<{ id: string }>();
  return (
    <Layout>
      <div style={{ padding: 24 }}>
        <h2>View Quotation</h2>
        <p><strong>Quotation ID:</strong> {id}</p>
        <p>This is a placeholder view page. Replace with the full quotation details UI.</p>
      </div>
    </Layout>
  );
}