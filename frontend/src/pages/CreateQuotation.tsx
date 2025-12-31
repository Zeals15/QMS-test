// src/pages/CreateQuotation.tsx
import { useEffect, useState, useRef } from "react";
import Layout from "../components/layout/Layout";
import { api } from "../api";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

import type { Customer, CustomerLocation, CustomerContact } from "../types/crm";

/* ================= TYPES ================= */

type Product = {
  id: number;
  name: string;
  description?: string;
  uom?: string;
  unit_price?: number;
  tax_rate?: number;
};

type LineItem = {
  id: string;
  product_id: number;
  product_name: string;
  description: string;
  qty: number | "";
  uom: string;
  unit_price: number | "";
  tax_rate: number | "";
};

/* ================= STYLES ================= */

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-15px " +
  "focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-rose-400";

const textareaClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-15px resize-none " +
  "focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-rose-400";

const cardClass =
  "bg-white rounded-xl border border-gray-200 shadow-sm p-6 transition-shadow hover:shadow-md";

/* ================= COMPONENT ================= */

export default function CreateQuotation() {
  const navigate = useNavigate();

  /* ---------- BASIC ---------- */
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [validityDays, setValidityDays] = useState<number | "">(30);
  const [saving, setSaving] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);

  /* ---------- MASTER ---------- */
  const [products, setProducts] = useState<Product[]>([]);

  /* ---------- CRM SELECTION (Customer → Location → Contact) ---------- */
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<CustomerLocation | null>(null);
  const [selectedContact, setSelectedContact] = useState<CustomerContact | null>(null);

  /* -----Search customer ui-state additions----- */
  const [customerSearch, setCustomerSearch] = useState("");
  const [locationSearch, setLocationSearch] = useState("");
  const [contactSearch, setContactSearch] = useState("");

  const [openCustomer, setOpenCustomer] = useState(false);
  const [openLocation, setOpenLocation] = useState(false);
  const [openContact, setOpenContact] = useState(false);

  /* ---------- CRM MASTER DATA ---------- */
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [locations, setLocations] = useState<CustomerLocation[]>([]);
  const [contacts, setContacts] = useState<CustomerContact[]>([]);

  const [addContactOpen, setAddContactOpen] = useState(false);
  const [editContact, setEditContact] = useState<any>(null);
  const [contactForm, setContactForm] = useState({
    contact_name: "",
    phone: "",
    email: "",
  });

  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);

  const [customerForm, setCustomerForm] = useState({
    company_name: "",
    gstin: "",
    address: "",
  });

  const [addLocationOpen, setAddLocationOpen] = useState(false);
  const [editLocation, setEditLocation] = useState<CustomerLocation | null>(null);

  const [locationForm, setLocationForm] = useState({
    location_name: "",
    gstin: "",
    address: "",
    city: "",
    state: "",
  });

  /* ---------- PRODUCTS ---------- */
  const [productSearch, setProductSearch] = useState<Record<string, string>>({});
  const [openRow, setOpenRow] = useState<string | null>(null);

  /* ---------- ADD PRODUCT MODAL ---------- */
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [_productSubmitting, setProductSubmitting] = useState(false);
  const [productModalRowId, setProductModalRowId] = useState<string | null>(null);



  const [productForm, setProductForm] = useState({
    name: "",
    description: "",
    uom: "NOS",
    unit_price: "",
    tax_rate: "18",
    status: "active",
  });

  /* ---------- ITEMS ---------- */
  const [items, setItems] = useState<LineItem[]>([
    {
      id: `${Date.now()}`,
      product_id: 0,
      product_name: "",
      description: "",
      qty: 1,
      uom: "NOS",
      unit_price: "",
      tax_rate: 18,
    },
  ]);

  /* ---------- TERMS ---------- */
  const [terms, setTerms] = useState(
    `1. Delivery time: 4–6 weeks from order confirmation
2. Prices are subject to change without notice`
  );
  const [notes, setNotes] = useState("");

  const [paymentTerms, setPaymentTerms] = useState("");

  /* ================= EFFECTS ================= */

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const rawProducts = await api.getProducts();
        const normalized = rawProducts.map((p: any) => ({
          id: p.id,
          name: p.name ?? p.product_name ?? "",
          description: p.description ?? "",
          uom: p.uom ?? "NOS",
          unit_price: Number(p.unit_price ?? 0),
          tax_rate: Number(p.tax_rate ?? 18),
        }));

        if (alive) setProducts(normalized);
      } catch {
        toast.error("Failed to load products");
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // Load customers on mount

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const cust = await api.getCustomers();
        if (!alive) return;
        setCustomers(cust);
      } catch (e) {
        console.error(e);
        toast.error("Failed to load customers");
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // Load locations when customer changes

  useEffect(() => {
    if (!selectedCustomer) {
      setLocations([]);
      setSelectedLocation(null);
      return;
    }

    let alive = true;

    (async () => {
      try {
        const loc = await api.getCustomerLocations(selectedCustomer.id);
        if (!alive) return;
        setLocations(loc);
      } catch (e) {
        console.error(e);
        toast.error("Failed to load locations");
      }
    })();

    return () => {
      alive = false;
    };
  }, [selectedCustomer]);

  // Load contacts when location changes

  useEffect(() => {
    if (!selectedLocation) {
      setContacts([]);
      setSelectedContact(null);
      return;
    }

    let alive = true;

    (async () => {
      try {
        const cont = await api.getCustomerContacts(selectedLocation.id);
        if (!alive) return;
        setContacts(cont);
      } catch (e) {
        console.error(e);
        toast.error("Failed to load contacts");
      }
    })();

    return () => {
      alive = false;
    };
  }, [selectedLocation]);



  /* ================= GLOBAL CLICK CLOSE FOR PRODUCT ROWS ================= */

  useEffect(() => {
    function close() {
      setOpenRow(null);
    }

    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);



  /* ================= ITEMS ================= */

  function addItem() {
    setItems((s) => [
      ...s,
      {
        id: `${Date.now()}-${s.length}`,
        product_id: 0,
        product_name: "",
        description: "",
        qty: 1,
        uom: "NOS",
        unit_price: 0,
        tax_rate: 18,
      },
    ]);
  }

  function updateItem(id: string, patch: Partial<LineItem>) {
    setItems((s) => s.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function removeItem(id: string) {
    setItems((s) => s.filter((i) => i.id !== id));
  }

  function onProductSelect(lineId: string, p: Product) {
    updateItem(lineId, {
      product_id: p.id,
      product_name: p.name,
      description: p.description || p.name,
      unit_price: p.unit_price || 0,
      tax_rate: p.tax_rate || 18,
      uom: p.uom || "NOS",
    });
    setOpenRow(null);
    setProductSearch((s) => ({ ...s, [lineId]: "" }));
  }

  // ================= ADD / EDIT CONTACT ================= //

  function openAddContact() {
    setEditContact(null);
    setContactForm({ contact_name: "", phone: "", email: "" });
    setAddContactOpen(true);
  }

  function openEditContact(contact: CustomerContact) {
    setEditContact(contact);
    setContactForm({
      contact_name: contact.contact_name || "",
      phone: contact.phone || "",
      email: contact.email || "",
    });
    setAddContactOpen(true);
  }

  // ================= ADD / EDIT CUSTOMER ================= //

  function openAddCustomer() {
    setEditCustomer(null);
    setCustomerForm({ company_name: "", gstin: "", address: "" });
    setAddCustomerOpen(true);
  }

  function openEditCustomer(c: Customer) {
    setEditCustomer(c);
    setCustomerForm({
      company_name: c.company_name || "",
      gstin: (c as any).gstin || "",
      address: (c as any).address || "",
    });
    setAddCustomerOpen(true);
  }

  // ================= ADD / EDIT LOCATION ================= //

  function openAddLocation() {
    if (!selectedCustomer) {
      toast.warn("Select customer first");
      return;
    }

    setEditLocation(null);
    setLocationForm({
      location_name: "",
      gstin: "",
      address: "",
      city: "",
      state: "",
    });
    setAddLocationOpen(true);
  }

  function openEditLocation(l: CustomerLocation) {
    setEditLocation(l);
    setLocationForm({
      location_name: l.location_name || "",
      gstin: l.gstin || "",
      address: l.address || "",
      city: l.city || "",
      state: l.state || "",
    });
    setAddLocationOpen(true);
  }


  /* ================= TOTALS ================= */

  const subtotal = items.reduce(
    (s, i) => s + (Number(i.qty) || 0) * (Number(i.unit_price) || 0),
    0
  );

  const taxTotal = items.reduce(
    (s, i) =>
      s +
      ((Number(i.qty) || 0) *
        (Number(i.unit_price) || 0) *
        (Number(i.tax_rate) || 0)) /
      100,
    0
  );
  const grandTotal = subtotal + taxTotal;

  /* ================= ADD PRODUCT ================= */

  async function submitProductFromQuotation() {
    if (!productForm.name.trim()) {
      toast.warn("Product name is required");
      return;
    }

    setProductSubmitting(true);

    try {
      const payload = {
        name: productForm.name,
        description: productForm.description,
        uom: productForm.uom,
        unit_price: Number(productForm.unit_price || 0),
        tax_rate: Number(productForm.tax_rate || 0),
        status: productForm.status,
      };

      const created = await api.addProduct(payload);

      const normalizedProduct: Product = {
        id: created.id,
        name: created.name ?? created.product_name ?? "",
        description: created.description ?? "",
        uom: created.uom ?? "NOS",
        unit_price: Number(created.unit_price ?? 0),
        tax_rate: Number(created.tax_rate ?? 18),
      };

      setProducts((prev) => [...prev, normalizedProduct]);

      if (productModalRowId) {
        updateItem(productModalRowId, {
          product_id: normalizedProduct.id,
          product_name: normalizedProduct.name,
          description: normalizedProduct.description || "",
          unit_price: normalizedProduct.unit_price || 0,
          tax_rate: normalizedProduct.tax_rate || 18,
          uom: normalizedProduct.uom || "NOS",
        });
      }

      toast.success("Product added");
      setAddProductOpen(false);
      setProductModalRowId(null);
      setProductForm({
        name: "",
        description: "",
        uom: "NOS",
        unit_price: "",
        tax_rate: "18",
        status: "active",
      });
    } catch (e) {
      console.error(e);
      toast.error("Failed to add product");
    } finally {
      setProductSubmitting(false);
    }
  }


  // ================= ADD / EDIT CUSTOMER ================= //
  async function submitCustomer() {
    if (!customerForm.company_name.trim()) {
      toast.warn("Company name is required");
      return;
    }

    try {
      let saved: Customer;

      if (editCustomer) {
        saved = await api.updateCustomer(editCustomer.id, customerForm);

        setCustomers((prev) =>
          prev.map((c) => (c.id === saved.id ? saved : c))
        );

        setSelectedCustomer(saved);
        toast.success("Customer updated");
      } else {
        saved = await api.addCustomer(customerForm);

        setCustomers((prev) => [...prev, saved]);
        setSelectedCustomer(saved);
        toast.success("Customer added");
      }

      setAddCustomerOpen(false);
      setEditCustomer(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save customer");
    }
  }

  async function deleteCustomer(customerId: number) {
    if (!window.confirm("Delete this customer?")) return;

    try {
      await api.deleteCustomer(customerId);

      setCustomers((prev) => prev.filter((c) => c.id !== customerId));
      setSelectedCustomer(null);
      setSelectedLocation(null);
      setSelectedContact(null);

      toast.success("Customer deleted");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete customer");
    }
  }

  // ================= ADD / EDIT LOCATION ================= //

  async function submitLocation() {
    if (!locationForm.location_name.trim()) {
      toast.warn("Location name is required");
      return;
    }

    if (!selectedCustomer) return;

    try {
      let saved: CustomerLocation;

      if (editLocation) {
        saved = await api.updateCustomerLocation(
          selectedCustomer.id,
          editLocation.id,
          locationForm
        );

        setLocations((prev) =>
          prev.map((l) => (l.id === saved.id ? saved : l))
        );
      } else {
        saved = await api.addCustomerLocation(
          selectedCustomer.id,
          locationForm
        );

        setLocations((prev) => [...prev, saved]);
      }

      setSelectedLocation(saved);
      setLocationSearch(saved.location_name);

      setAddLocationOpen(false);
      setEditLocation(null);

      toast.success("Location saved");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save location");
    }
  }

  async function deleteLocation(locationId: number) {
    if (!selectedCustomer) return;

    if (!window.confirm("Delete this location?")) return;

    try {
      await api.deleteCustomerLocation(
        selectedCustomer.id,
        locationId
      );

      setLocations((prev) =>
        prev.filter((l) => l.id !== locationId)
      );

      if (selectedLocation?.id === locationId) {
        setSelectedLocation(null);
        setLocationSearch("");
        setSelectedContact(null);
      }

      toast.success("Location deleted");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete location");
    }
  }


  // ================= ADD / EDIT CONTACT ================= //

  async function deleteContact(contactId: number) {
    if (!selectedLocation || !selectedContact) {
      toast.error("No contact or location selected");
      return;
    }

    try {
      await api.deleteCustomerContact(
        selectedLocation.id,
        contactId
      );

      setContacts((prev) =>
        prev.filter((c) => c.id !== contactId)
      );

      if (selectedContact.id === contactId) {
        setSelectedContact(null);
      }

      toast.success("Contact deleted successfully");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete contact");
    }
  }

  /* ================= SUBMIT ================= */

  async function handleSubmit(status: "draft" | "pending") {
    if (!selectedCustomer) {
      toast.warn("Select customer");
      return;
    }

    if (!selectedLocation) {
      toast.warn("Select location / plant");
      return;
    }

    if (!selectedContact) {
      toast.warn("Select contact person");
      return;
    }

    setSaving(true);

    try {
      await api.createQuotation({
        quotation_date: date,
        validity_days: validityDays,
        payment_terms: paymentTerms,

        // 🔗 RELATIONS
        customer_id: selectedCustomer.id,
        customer_location_id: selectedLocation.id,
        customer_contact_id: selectedContact.id,

        // 📸 SNAPSHOT (IMMUTABLE)
        customer_snapshot: {
          company_name: selectedCustomer.company_name,

          location_name: selectedLocation.location_name,
          gstin: selectedLocation.gstin,
          address: selectedLocation.address,

          contact_name: selectedContact.contact_name,
          phone: selectedContact.phone,
          email: selectedContact.email,
        },

        // 🧾 ITEMS (NORMALIZED — IMPORTANT)
        items: items.map((i) => {
          const qty = Number(i.qty) || 0;
          const unitPrice = Number(i.unit_price) || 0;
          const taxRate = Number(i.tax_rate) || 0;

          const taxableAmount = qty * unitPrice;
          const taxAmount = (taxableAmount * taxRate) / 100;
          const totalAmount = taxableAmount + taxAmount;

          return {
            product_id: i.product_id,
            product_name: i.product_name,
            description: i.description,
            qty,
            uom: i.uom,
            unit_price: unitPrice,
            tax_rate: taxRate,

            taxable_amount: taxableAmount,
            tax_amount: taxAmount,
            total_amount: totalAmount,
          };
        }),

        // 💰 TOTAL
        total_value: grandTotal,

        terms,
        notes,
        status,
      });

      toast.success("Quotation saved successfully");
      navigate("/quotations");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save quotation");
    } finally {
      setSaving(false);
    }
  }


  // ================= ADD / EDIT CONTACT ================= //

  async function submitContact() {
    if (!contactForm.contact_name.trim()) {
      toast.warn("Contact name is required");
      return;
    }

    if (!selectedLocation) {
      toast.warn("Select a location first");
      return;
    }

    try {
      if (editContact) {
        // EDIT
        const updated = await api.updateCustomerContact(
          selectedLocation.id,
          editContact.id,
          {
            contact_name: contactForm.contact_name,
            phone: contactForm.phone,
            email: contactForm.email,
          }
        );

        setContacts((prev) =>
          prev.map((c) => (c.id === updated.id ? updated : c))
        );

        setSelectedContact(updated);
        toast.success("Contact updated");
      } else {
        // ADD
        const created = await api.addCustomerContact(
          selectedLocation.id,
          {
            contact_name: contactForm.contact_name,
            phone: contactForm.phone,
            email: contactForm.email,
          }
        );

        setContacts((prev) => [...prev, created]);
        setSelectedContact(created);
        toast.success("Contact added");
      }

      setAddContactOpen(false);
      setEditContact(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save contact");
    }
  }


  /* ================= RENDER ================= */
  return (
    <Layout>
      <div className="max-w-[1440px] mx-auto px-8 lg:px-12 py-8 pb-40 space-y-12">

        {/* ================= CUSTOMER & META ================= */}
        <div className="grid lg:grid-cols-3 gap-6 items-start">

          {/* ================= LEFT ================= */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl border border-gray-200 px-6 py-5 space-y-6">

              <h2 className="text-[17px] font-bold text-black-900-block">
                Customer Information
              </h2>

              {/* CUSTOMER */}
              <div>
                <label className="text-[15px] font-bold text-black mb-1 block">
                  CUSTOMER
                </label>

                <div className="relative">
                  <input
                    type="text"
                    value={openCustomer ? customerSearch : selectedCustomer?.company_name || ""}
                    onFocus={() => {
                      setCustomerSearch("");
                      setOpenCustomer(true);
                    }}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setOpenCustomer(true);
                    }}
                    placeholder="Search customer"
                    className="w-full h-12 rounded-lg border border-gray-300 px-4 text-[16px] focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />

                  {openCustomer && (
                    <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-60 overflow-auto">
                      {customers
                        .filter((c) =>
                          c.company_name.toLowerCase().includes(customerSearch.toLowerCase())
                        )
                        .map((c) => (
                          <div
                            key={c.id}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setSelectedCustomer(c);
                              setSelectedLocation(null);
                              setSelectedContact(null);
                              setCustomerSearch("");
                              setLocationSearch("");
                              setContactSearch("");
                              setOpenCustomer(false);
                            }}
                            className="px-4 py-2 cursor-pointer hover:bg-gray-100 text-[15px]"
                          >
                            {c.company_name}
                          </div>
                        ))}

                      <div
                        className="px-4 py-2 border-t text-[15px] text-rose-600 cursor-pointer hover:bg-rose-50"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setOpenCustomer(false);
                          openAddCustomer();
                        }}
                      >
                        + Add new customer
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* SELECTED CUSTOMER DETAILS */}

              {selectedCustomer && (
                <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3 text-[16px] space-y-1">

                  <p className="font-medium text-gray-900">
                    {selectedCustomer.company_name}
                  </p>

                  {(selectedCustomer as any).gstin && (
                    <p className="text-[13px] text-gray-600">
                      GSTIN: {(selectedCustomer as any).gstin}
                    </p>
                  )}

                  {(selectedCustomer as any).address && (
                    <p className="text-[13px] text-gray-600">
                      {(selectedCustomer as any).address}
                    </p>
                  )}

                  <div className="flex gap-4 pt-2 text-[14px]">
                    <button
                      type="button"
                      onClick={() => openEditCustomer(selectedCustomer)}
                      className="text-blue-600 hover:underline"
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteCustomer(selectedCustomer.id)}
                      className="text-rose-600 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}

              {/* LOCATION + CONTACT ROW */}
              <div className="grid md:grid-cols-2 gap-6">

                {/* ================= LOCATION COLUMN ================= */}
                <div className="space-y-3">
                  <label className="text-[15px] font-bold text-black block">
                    LOCATION / PLANT
                  </label>

                  <div className="relative">
                    <input
                      type="text"
                      value={openLocation ? locationSearch : selectedLocation?.location_name || ""}
                      onFocus={() => {
                        setLocationSearch("");
                        setOpenLocation(true);
                      }}
                      onChange={(e) => {
                        setLocationSearch(e.target.value);
                        setOpenLocation(true);
                      }}
                      placeholder="Search location"
                      disabled={!selectedCustomer}
                      className="w-full h-11 rounded-lg border border-gray-300 px-4 text-sm disabled:bg-gray-100"
                    />

                    {openLocation && selectedCustomer && (
                      <div
                        className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-60 overflow-auto"
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        {locations
                          .filter((l) =>
                            l.location_name.toLowerCase().includes(locationSearch.toLowerCase())
                          )
                          .map((l) => (
                            <div
                              key={l.id}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setSelectedLocation(l);
                                setSelectedContact(null);
                                setLocationSearch("");
                                setContactSearch("");
                                setOpenLocation(false);
                              }}
                              className="px-4 py-2 cursor-pointer hover:bg-gray-100 text-[15px]"
                            >
                              {l.location_name}
                            </div>
                          ))}

                        <div
                          className="px-4 py-2 border-t text-[15px] text-rose-600 cursor-pointer hover:bg-rose-50"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setOpenLocation(false);
                            openAddLocation();
                          }}
                        >
                          + Add new location
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SELECTED LOCATION DETAILS */}
                  {selectedLocation && (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm space-y-1">
                      <p className="font-medium text-gray-900 text-[16px]">
                        {selectedLocation.location_name}
                      </p>

                      {selectedLocation.gstin && (
                        <p className="text-[13px] text-gray-600">
                          GSTIN: {selectedLocation.gstin}
                        </p>
                      )}

                      {selectedLocation.address && (
                        <p className="text-[13px] text-gray-600">
                          {selectedLocation.address}
                        </p>
                      )}

                      <div className="flex gap-4 pt-2 text-[14px]">
                        <button
                          type="button"
                          onClick={() => openEditLocation(selectedLocation)}
                          className="text-blue-600 hover:underline"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteLocation(selectedLocation.id)}
                          className="text-rose-600 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* ================= CONTACT COLUMN ================= */}
                <div className="space-y-3">
                  <label className="text-[15px] font-bold text-black block">
                    CONTACT PERSON
                  </label>

                  <div className="relative">
                    <input
                      type="text"
                      value={contactSearch || selectedContact?.contact_name || ""}
                      onFocus={() => setOpenContact(true)}
                      onChange={(e) => {
                        setContactSearch(e.target.value);
                        setOpenContact(true);
                      }}
                      placeholder="Search contact"
                      disabled={!selectedLocation}
                      className="w-full h-11 rounded-lg border border-gray-300 px-4 text-[15px] disabled:bg-gray-100"
                    />

                    {openContact && selectedLocation && (
                      <div
                        className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-60 overflow-auto"
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        {contacts
                          .filter((ct) =>
                            ct.contact_name.toLowerCase().includes(contactSearch.toLowerCase())
                          )
                          .map((ct) => (
                            <div
                              key={ct.id}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setSelectedContact(ct);
                                setContactSearch("");
                                setOpenContact(false);
                              }}
                              className="px-4 py-2 cursor-pointer hover:bg-gray-100 text-[15px]"
                            >
                              {ct.contact_name}
                            </div>
                          ))}

                        <div
                          className="px-4 py-2 border-t text-sm text-rose-600 cursor-pointer hover:bg-rose-50"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setOpenContact(false);
                            openAddContact();
                          }}
                        >
                          + Add new contact
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SELECTED CONTACT DETAILS */}
                  {selectedContact && (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4  space-y-1">
                      <p className="font-medium text-gray-900 text-[16px]">
                        {selectedContact.contact_name}
                      </p>

                      {selectedContact.phone && (
                        <p className="text-[13px] text-gray-600">
                          📞 {selectedContact.phone}
                        </p>
                      )}

                      {selectedContact.email && (
                        <p className="text-[13px] text-gray-600">
                          ✉️ {selectedContact.email}
                        </p>
                      )}

                      <div className="flex gap-4 pt-2 text-[14px]">
                        <button
                          type="button"
                          onClick={() => openEditContact(selectedContact)}
                          className="text-blue-600 hover:underline"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete contact "${selectedContact.contact_name}"?`
                              )
                            ) {
                              deleteContact(selectedContact.id);
                              setSelectedContact(null);
                            }
                          }}
                          className="text-rose-600 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>

              </div>


              {/* DATE + VALIDITY */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[15px] font-bold text-bold-500 mb-2 block">
                    QUOTATION DATE
                  </label>
                  <div className="relative">
                    <input
                      ref={dateInputRef}
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full h-11 rounded-lg border border-gray-300 px-4 pr-10 text-[16px]"
                    />

                    {/* Manual calendar button */}
                    <button
                      type="button"
                      onClick={() => {
                        const el = dateInputRef.current;
                        if (!el) return;
                        if (el.showPicker) el.showPicker(); // Chrome / Edge
                        else el.focus(); // Firefox / Safari fallback
                      }}
                      className="absolute inset-y-0 right-3 flex items-center text-gray-500 hover:text-gray-700"
                      aria-label="Open calendar"
                    >
                      📅
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[15px] font-bold text-black-500 mb-2 block">
                    VALIDITY (DAYS)
                  </label>
                  <input
                    type="number"
                    value={validityDays}
                    onChange={(e) => {
                      const v = e.target.value;
                      setValidityDays(v === "" ? "" : Number(v));
                    }}
                    min={1}
                    className="w-full h-11 rounded-lg border border-gray-300 px-4 text-[16px]"
                  />
                </div>
              </div>

            </div>
          </div>

          {/* ================= RIGHT ================= */}
          <div className="bg-gray-50 rounded-2xl border border-gray-200 px-5 py-4 sticky top-6">

            <h3 className="text-[17px] font-semibold text-gray-900 mb-4">
              Selected Context
            </h3>

            {!selectedCustomer ? (
              <p className="text-[15px] text-gray-400">
                Select a customer to view details
              </p>
            ) : (
              <div className="space-y-4 text-[15px]">

                <div>
                  <p className="text-[12px] uppercase text-gray-500">Company</p>
                  <p className="font-medium">{selectedCustomer.company_name}</p>
                </div>

                {selectedLocation && (
                  <div className="pt-3 border-t">
                    <p className="text-[12px] uppercase text-gray-500">
                      Location / Plant
                    </p>
                    <p className="font-medium">{selectedLocation.location_name}</p>
                    {selectedLocation.gstin && (
                      <p className="text-[13px] text-gray-500 mt-1">
                        GSTIN: {selectedLocation.gstin}
                      </p>
                    )}
                  </div>
                )}

                {selectedContact && (
                  <div className="pt-3 border-t">
                    <p className="text-[11px] uppercase text-gray-500">
                      Contact Person
                    </p>
                    <p className="font-medium">{selectedContact.contact_name}</p>
                    {selectedContact.phone && (
                      <p className="text-xs text-gray-600">{selectedContact.phone}</p>
                    )}
                    {selectedContact.email && (
                      <p className="text-xs text-gray-600">{selectedContact.email}</p>
                    )}
                  </div>
                )}

              </div>
            )}
          </div>
        </div>


        {/* LINE ITEMS */}
        <div className={cardClass}>
          <div className="flex justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-800">Line Items</h3>
            <button onClick={addItem} className="border px-3 py-1 rounded">
              + Add Item
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                <tr className="border-t">
                  <th className="p-2">#</th>
                  <th className="p-2 text-left">Product</th>
                  <th className="p-2">Qty</th>
                  <th className="p-2">UOM</th>
                  <th className="p-2">Rate</th>
                  <th className="p-2">Tax %</th>
                  <th className="p-2 text-right font-semibold text-gray-800">
                    Amount
                  </th>
                  <th />
                </tr>
              </thead>

              <tbody>
                {items.map((it, idx) => (
                  <tr
                    key={it.id}
                    className="border-t hover:bg-gray-50 transition-colors"
                  >
                    <td className="p-2 text-center text-gray-500">{idx + 1}</td>

                    <td className="p-2 relative">
                      <input
                        value={
                          openRow === it.id
                            ? productSearch[it.id] || ""
                            : it.product_name
                        }
                        onFocus={() => setOpenRow(it.id)}
                        onChange={(e) =>
                          setProductSearch({
                            ...productSearch,
                            [it.id]: e.target.value,
                          })
                        }
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-rose-400"
                        aria-label={`Product for line item ${idx + 1}`}
                      />
                      {it.description && (
                        <textarea
                          className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1 text-xs focus:ring-1 focus:ring-rose-400 focus:outline-none"
                          placeholder="Description (editable)"
                          aria-label={`Description for line item ${idx + 1}`}
                          value={it.description}
                          onChange={(e) =>
                            updateItem(it.id, { description: e.target.value })
                          }
                          rows={2}
                        />
                      )}

                      {openRow === it.id && (
                        <div className="absolute bg-white border w-full z-10 max-h-40 overflow-auto">
                          {products
                            .filter((p) =>
                              (p.name ?? "")
                                .toLowerCase()
                                .includes(
                                  (productSearch[it.id] || "").toLowerCase()
                                )
                            )
                            .map((p) => (
                              <div
                                key={p.id}
                                className="px-2 py-1 hover:bg-gray-100 cursor-pointer"
                                onMouseDown={() => onProductSelect(it.id, p)}
                              >
                                {p.name} — ₹{p.unit_price ?? 0}
                              </div>
                            ))}

                          {/* ➕ ADD PRODUCT OPTION */}
                          {productSearch[it.id] &&
                            !products.some(
                              (p) =>
                                (p.name ?? "").toLowerCase() ===
                                (productSearch[it.id] ?? "").toLowerCase()
                            ) && (
                              <div
                                className="px-2 py-1 border-t text-rose-600 cursor-pointer hover:bg-rose-50"
                                onMouseDown={() => {
                                  setProductForm({
                                    name: productSearch[it.id],
                                    description: "",
                                    uom: "NOS",
                                    unit_price: "",
                                    tax_rate: "18",
                                    status: "active",
                                  });
                                  setProductModalRowId(it.id);
                                  setAddProductOpen(true);
                                  setOpenRow(null);
                                }}
                              >
                                + Add product "{productSearch[it.id]}"
                              </div>
                            )}
                        </div>
                      )}
                    </td>

                    <td className="p-2">
                      <input
                        type="number"
                        value={it.qty}
                        aria-label={`Quantity for line item ${idx + 1}`}
                        onChange={(e) =>
                          updateItem(it.id, {
                            qty: e.target.value === "" ? "" : Number(e.target.value),
                          })
                        }
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm w-16 focus:outline-none focus:ring-1 focus:ring-rose-400"
                      />
                    </td>

                    <td className="p-2">
                      <input
                        value={it.uom}
                        aria-label={`Unit for line item ${idx + 1}`}
                        onChange={(e) =>
                          updateItem(it.id, { uom: e.target.value })
                        }
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm w-16 focus:outline-none focus:ring-1 focus:ring-rose-400"
                      />
                    </td>

                    <td className="p-2">
                      <input
                        type="number"
                        value={it.unit_price}
                        aria-label={`Rate for line item ${idx + 1}`}
                        onChange={(e) =>
                          updateItem(it.id, {
                            unit_price: e.target.value === "" ? "" : Number(e.target.value),
                          })
                        }

                        className={inputClass}
                      />
                    </td>

                    <td className="p-2">
                      <input
                        type="number"
                        value={it.tax_rate}
                        aria-label={`Tax rate for line item ${idx + 1}`}
                        onChange={(e) =>
                          updateItem(it.id, {
                            tax_rate: e.target.value === "" ? "" : Number(e.target.value),
                          })
                        }
                        className={inputClass}
                      />
                    </td>

                    <td className="p-2 text-right font-medium">
                      ₹{(
                        (Number(it.qty) || 0) *
                        (Number(it.unit_price) || 0)
                      ).toLocaleString()}
                    </td>

                    <td className="p-2">
                      <button
                        onClick={() => removeItem(it.id)}
                        className="text-rose-600"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-6 flex justify-end p-6">
              <div className="w-full max-w-sm space-y-2 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>₹{subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Tax</span>
                  <span>₹{taxTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-base font-semibold text-gray-900 border-t pt-2">
                  <span>Grand Total</span>
                  <span>₹{grandTotal.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ================= COMMERCIAL TERMS ================= */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
          <h3 className="text-sm font-semibold text-gray-800">
            Commercial Terms
          </h3>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              Payment Terms
            </label>

            <input
              type="text"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              placeholder="e.g. 30 days from invoice date"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm
               focus:outline-none focus:ring-2 focus:ring-gray-300"
            />

            <p className="text-[11px] text-gray-400 mt-1">
              Example: 100% Advance / Net 30 / 30 days from invoice date
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              Terms & Conditions (Client Facing)
            </label>
            <textarea
              className="w-full rounded-md border border-gray-300 px-3 py-2 h-32 bg-gray-50 text-sm focus:ring-2 focus:ring-gray-300 focus:outline-none"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              Internal Notes (Not visible to customer)
            </label>
            <textarea
              className="w-full rounded-md border border-gray-300 px-3 py-2 h-24 text-sm focus:ring-2 focus:ring-gray-300 focus:outline-none"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate("/quotations")}
            className="px-4 py-2 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => handleSubmit("draft")}
            className="px-4 py-2 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Save Draft
          </button>
          <button
            onClick={() => handleSubmit("pending")}
            className="px-5 py-2 text-sm font-medium bg-gray-900 text-white rounded-md hover:bg-gray-800"
          >
            {saving ? "Saving…" : "Save Quotation"}
          </button>
        </div>

        {/* ================= STICKY FOOTER ================= */}

      </div>

      {addContactOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">

            <h3 className="text-base font-semibold text-gray-900">
              {editContact ? "Edit Contact Person" : "Add Contact Person"}
            </h3>

            <div>
              <label className="text-xs text-gray-500">Contact Name</label>
              <input
                className={inputClass}
                value={contactForm.contact_name}
                onChange={(e) =>
                  setContactForm((f) => ({ ...f, contact_name: e.target.value }))
                }
              />
            </div>

            <div>
              <label className="text-xs text-gray-500">Phone</label>
              <input
                className={inputClass}
                value={contactForm.phone}
                onChange={(e) =>
                  setContactForm((f) => ({ ...f, phone: e.target.value }))
                }
              />
            </div>

            <div>
              <label className="text-xs text-gray-500">Email</label>
              <input
                className={inputClass}
                value={contactForm.email}
                onChange={(e) =>
                  setContactForm((f) => ({ ...f, email: e.target.value }))
                }
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => {
                  setAddContactOpen(false);
                  setEditContact(null);
                }}
                className="px-4 py-2 text-sm border rounded-md"
              >
                Cancel
              </button>

              <button
                onClick={submitContact}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded-md"
              >
                {editContact ? "Update Contact" : "Add Contact"}
              </button>
            </div>

          </div>
        </div>
      )}

      {addCustomerOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">

            <h3 className="text-base font-semibold">
              {editCustomer ? "Edit Customer" : "Add Customer"}
            </h3>

            <input
              className={inputClass}
              placeholder="Company Name"
              value={customerForm.company_name}
              onChange={(e) =>
                setCustomerForm((f) => ({ ...f, company_name: e.target.value }))
              }
            />

            <input
              className={inputClass}
              placeholder="GSTIN"
              value={customerForm.gstin}
              onChange={(e) =>
                setCustomerForm((f) => ({ ...f, gstin: e.target.value }))
              }
            />

            <textarea
              className={textareaClass}
              placeholder="Address"
              value={customerForm.address}
              onChange={(e) =>
                setCustomerForm((f) => ({ ...f, address: e.target.value }))
              }
            />

            <div className="flex justify-end gap-3">
              <button onClick={() => setAddCustomerOpen(false)}>Cancel</button>
              <button
                onClick={submitCustomer}
                className="bg-gray-900 text-white px-4 py-2 rounded-md"
              >
                {editCustomer ? "Update" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {addLocationOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">

            <h3 className="text-base font-semibold">
              {editLocation ? "Edit Location" : "Add Location"}
            </h3>

            <input
              className={inputClass}
              placeholder="Location Name"
              value={locationForm.location_name}
              onChange={(e) =>
                setLocationForm((f) => ({ ...f, location_name: e.target.value }))
              }
            />

            <input
              className={inputClass}
              placeholder="GSTIN"
              value={locationForm.gstin}
              onChange={(e) =>
                setLocationForm((f) => ({ ...f, gstin: e.target.value }))
              }
            />

            <textarea
              className={textareaClass}
              placeholder="Address"
              value={locationForm.address}
              onChange={(e) =>
                setLocationForm((f) => ({ ...f, address: e.target.value }))
              }
            />

            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => {
                  setAddLocationOpen(false);
                  setEditLocation(null);
                }}
              >
                Cancel
              </button>

              <button
                onClick={submitLocation}
                className="bg-gray-900 text-white px-4 py-2 rounded-md"
              >
                {editLocation ? "Update" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {addProductOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">

            <h3 className="text-base font-semibold text-gray-900">
              Add Product
            </h3>

            <input
              className={inputClass}
              placeholder="Product Name"
              value={productForm.name}
              onChange={(e) =>
                setProductForm((f) => ({ ...f, name: e.target.value }))
              }
            />

            <textarea
              className={textareaClass}
              placeholder="Description"
              value={productForm.description}
              onChange={(e) =>
                setProductForm((f) => ({ ...f, description: e.target.value }))
              }
            />

            <div className="grid grid-cols-2 gap-3">
              <input
                className={inputClass}
                placeholder="UOM"
                value={productForm.uom}
                onChange={(e) =>
                  setProductForm((f) => ({ ...f, uom: e.target.value }))
                }
              />

              <input
                type="number"
                className={inputClass}
                placeholder="Rate"
                value={productForm.unit_price}
                onChange={(e) =>
                  setProductForm((f) => ({ ...f, unit_price: e.target.value }))
                }
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => setAddProductOpen(false)}
                className="px-4 py-2 text-sm border rounded-md"
              >
                Cancel
              </button>

              <button
                onClick={submitProductFromQuotation}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded-md"
              >
                Add Product
              </button>
            </div>

          </div>
        </div>
      )}


    </Layout>



  );
}
