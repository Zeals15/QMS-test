import { useEffect, useState } from 'react';
import Layout from '../components/layout/Layout';
import { api } from '../api';
import { useNavigate } from 'react-router-dom';

type Product = {
  id: number;
  name: string;
  hsn_code?: string;
  uom?: string;
  unit_price?: number;
  tax_rate?: number;
};

type Customer = {
  id: number;
  company_name: string;
};

type LineItem = {
  id: string; // local id
  product_id: number;
  description: string;
  hsn_code: string;
  qty: number;
  uom: string;
  unit_price: number;
  tax_rate: number;
  discount_percent: number;
};

export default function CreateQuotation() {
  const navigate = useNavigate();

  // basic info
  const [customerId, setCustomerId] = useState<number>(0);
  const [salesperson, setSalesperson] = useState<number | null>(null);
  const [date, setDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [validityDays, setValidityDays] = useState<number>(30);

  // lists
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // line items
  const [items, setItems] = useState<LineItem[]>([
    {
      id: `${Date.now()}-0`,
      product_id: 0,
      description: '',
      hsn_code: '',
      qty: 1,
      uom: 'NOS',
      unit_price: 0,
      tax_rate: 18,
      discount_percent: 0
    }
  ]);

  // additional info
  const [terms, setTerms] = useState<string>(
    `1. Payment terms: 30 days from invoice date
2. Delivery time: 4-6 weeks from order confirmation
3. Prices are subject to change without notice`
  );
  const [notes, setNotes] = useState<string>('');

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadLists();
  }, []);

  async function loadLists() {
    try {
      const [cust, prod] = await Promise.all([api.getCustomers(), api.getProducts()]);
      setCustomers(cust || []);
      setProducts(prod || []);
    } catch (err) {
      console.error('Failed to load lists', err);
      alert('Failed to load customers or products (check console)');
    }
  }

  function addItem() {
    setItems((s) => [
      ...s,
      {
        id: `${Date.now()}-${s.length}`,
        product_id: 0,
        description: '',
        hsn_code: '',
        qty: 1,
        uom: 'NOS',
        unit_price: 0,
        tax_rate: 18,
        discount_percent: 0
      }
    ]);
  }

  function removeItem(id: string) {
    setItems((s) => s.filter((x) => x.id !== id));
  }

  function updateItem(id: string, patch: Partial<LineItem>) {
    setItems((s) => s.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function onProductChange(id: string, productId: number) {
    const p = products.find((x) => x.id === Number(productId));
    updateItem(id, {
      product_id: Number(productId),
      unit_price: p?.unit_price ?? 0,
      hsn_code: p?.hsn_code ?? '',
      uom: p?.uom ?? 'NOS',
      tax_rate: p?.tax_rate ?? 18
    });
  }

  function calcLineTotal(it: LineItem) {
    const gross = (it.qty || 0) * (it.unit_price || 0);
    const discount = (gross * (it.discount_percent || 0)) / 100;
    const afterDisc = gross - discount;
    // tax on after-disc
    const tax = (afterDisc * (it.tax_rate || 0)) / 100;
    const total = afterDisc + tax;
    return { gross, discount, afterDisc, tax, total };
  }

  function calcTotals() {
    let subtotal = 0;
    let tax = 0;
    for (const it of items) {
      const line = calcLineTotal(it);
      subtotal += line.afterDisc;
      tax += line.tax;
    }
    const grand = subtotal + tax;
    return { subtotal, tax, grand };
  }

  async function handleSubmit(action: 'draft' | 'submit') {
    // build payload that your backend expects
    if (!customerId) {
      alert('Select a customer');
      return;
    }
    setSaving(true);
    try {
      // compute a simple quotation number and the total value
      const quotation_no = `Q${Date.now()}`;
      const customer = customers.find((c) => c.id === customerId);
      const customer_name = customer ? customer.company_name : '';
      const total_value = Math.round((totals.grand || 0) * 100) / 100;

      const payload = {
        quotation_no,
        customer_id: customerId,
        customer_name,
        salesperson_id: salesperson,
        quotation_date: date,
        validity_days: validityDays,
        total_value,
        items: items.map((it) => ({
          product_id: it.product_id || null,
          description: it.description,
          hsn_code: it.hsn_code,
          qty: it.qty,
          uom: it.uom,
          unit_price: it.unit_price,
          tax_rate: it.tax_rate,
          discount_percent: it.discount_percent
        })),
        terms,
        notes,
        status: action === 'draft' ? 'Draft' : 'Pending'
      };

      await api.createQuotation(payload);
      alert(action === 'draft' ? 'Saved as draft' : 'Submitted for approval');
      navigate('/quotations');
    } catch (err) {
      console.error('Create quotation failed', err);
      // show detailed error to help debugging (message often contains HTTP status and body)
      const msg = (err as any)?.message || String(err);
      alert('Failed to create quotation: ' + msg + '\nSee console and server logs for more details.');
    } finally {
      setSaving(false);
    }
  }

  const totals = calcTotals();

  return (
    <Layout>
      <div className="p-8 max-w-6xl mx-auto">
        <div className="flex items-center mb-6">
          <button className="text-gray-500 mr-4" onClick={() => navigate('/quotations')}>
            ←
          </button>
          <div>
            <h1 className="text-2xl font-bold">Create New Quotation</h1>
            <p className="text-sm text-gray-500">Fill in the details to generate a quotation</p>
          </div>
        </div>

        {/* Basic Information */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <h3 className="font-semibold text-lg mb-4">Basic Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Customer *</label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(Number(e.target.value))}
                className="w-full border rounded px-3 py-2 mt-1"
              >
                <option value={0}>Select customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Salesperson *</label>
              <select
                value={salesperson ?? ''}
                onChange={(e) => setSalesperson(e.target.value ? Number(e.target.value) : null)}
                className="w-full border rounded px-3 py-2 mt-1"
              >
                <option value="">Select salesperson</option>
                {/* If you have a users list, map them here. For now show placeholder */}
                <option value={1}>Salesperson 1</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Quotation Date *</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border rounded px-3 py-2 mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Validity (Days) *</label>
              <input
                type="number"
                value={validityDays}
                onChange={(e) => setValidityDays(Number(e.target.value))}
                className="w-full border rounded px-3 py-2 mt-1"
              />
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-lg">Line Items</h3>
            <button
              onClick={addItem}
              className="text-sm px-3 py-2 border rounded bg-white hover:bg-gray-50"
            >
              + Add Item
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full table-auto text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-2">S.No</th>
                  <th className="py-2">Description</th>
                  <th className="py-2">HSN Code</th>
                  <th className="py-2">Qty</th>
                  <th className="py-2">UOM</th>
                  <th className="py-2">Unit Rate (₹)</th>
                  <th className="py-2">Disc. %</th>
                  <th className="py-2">Total (₹)</th>
                  <th className="py-2"> </th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const ln = calcLineTotal(it);
                  return (
                    <tr key={it.id} className="border-t">
                      <td className="py-3 align-top w-12">{idx + 1}</td>

                      <td className="py-3 align-top">
                        <select
                          value={it.product_id}
                          onChange={(e) => onProductChange(it.id, Number(e.target.value))}
                          className="w-full border rounded px-2 py-1 mb-2"
                        >
                          <option value={0}>Select product</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>

                        <input
                          placeholder="Enter description"
                          value={it.description}
                          onChange={(e) => updateItem(it.id, { description: e.target.value })}
                          className="w-full border rounded px-2 py-1"
                        />
                      </td>

                      <td className="py-3 align-top w-24">
                        <input
                          value={it.hsn_code}
                          onChange={(e) => updateItem(it.id, { hsn_code: e.target.value })}
                          className="w-full border rounded px-2 py-1"
                        />
                      </td>

                      <td className="py-3 align-top w-20">
                        <input
                          type="number"
                          value={it.qty}
                          min={0}
                          onChange={(e) => updateItem(it.id, { qty: Number(e.target.value) })}
                          className="w-full border rounded px-2 py-1"
                        />
                      </td>

                      <td className="py-3 align-top w-24">
                        <select
                          value={it.uom}
                          onChange={(e) => updateItem(it.id, { uom: e.target.value })}
                          className="w-full border rounded px-2 py-1"
                        >
                          <option>NOS</option>
                          <option>SET</option>
                          <option>HR</option>
                        </select>
                      </td>

                      <td className="py-3 align-top w-36">
                        <input
                          type="number"
                          value={it.unit_price}
                          min={0}
                          onChange={(e) => updateItem(it.id, { unit_price: Number(e.target.value) })}
                          className="w-full border rounded px-2 py-1"
                        />
                      </td>

                      <td className="py-3 align-top w-24">
                        <input
                          type="number"
                          value={it.discount_percent}
                          min={0}
                          max={100}
                          onChange={(e) => updateItem(it.id, { discount_percent: Number(e.target.value) })}
                          className="w-full border rounded px-2 py-1"
                        />
                      </td>

                      <td className="py-3 align-top text-right w-32 font-semibold">{Number(ln.total).toLocaleString()}</td>

                      <td className="py-3 align-top w-20">
                        <button
                          onClick={() => removeItem(it.id)}
                          className="text-sm text-rose-600 hover:underline"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* totals */}
          <div className="mt-6 flex justify-end">
            <div className="w-64">
              <div className="flex justify-between text-sm text-gray-600">
                <div>Subtotal:</div>
                <div>₹{Number(totals.subtotal).toLocaleString()}</div>
              </div>
              <div className="flex justify-between text-sm text-gray-600 mt-1">
                <div>Tax (incl):</div>
                <div>₹{Number(totals.tax).toLocaleString()}</div>
              </div>
              <div className="border-t mt-3 pt-3 flex justify-between font-semibold">
                <div>Grand Total:</div>
                <div>₹{Number(totals.grand).toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <h3 className="font-semibold text-lg mb-2">Additional Information</h3>
          <label className="text-sm text-gray-600">Terms & Conditions</label>
          <textarea
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            className="w-full border rounded px-3 py-2 mt-2 h-28"
          />

          <label className="text-sm text-gray-600 mt-4 block">Internal Notes (Optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border rounded px-3 py-2 mt-2 h-20"
            placeholder="Add any internal notes..."
          />
        </div>

        {/* actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={() => navigate('/quotations')}
            className="px-4 py-2 border rounded bg-white"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={() => handleSubmit('draft')}
            className="px-4 py-2 border rounded bg-gray-100"
            disabled={saving}
          >
            Save as Draft
          </button>
          <button
            onClick={() => handleSubmit('submit')}
            className="px-4 py-2 rounded bg-rose-500 text-white"
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Submit for Approval'}
          </button>
        </div>
      </div>
    </Layout>
  );
}
