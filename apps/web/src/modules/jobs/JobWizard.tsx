import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ClipboardList } from "lucide-react";
import { api } from "../../lib/api";

type Option = { id: string; label: string };
type Vehicle = { id: string; registration: string; fleetNumber?: string | null; status: string };
type Driver = { id: string; firstName: string; lastName: string; isActive: boolean };
type Form = {
  reference: string; customerName: string; collectionAddress: string; collectionPostcode: string;
  scheduledAt: string; deliveryAddress: string; deliveryPostcode: string; deliveryAt: string;
  vehicleId: string; driverId: string; instructions: string; rate: string; weightKg: string; pallets: string;
};

const initial: Form = { reference: "", customerName: "", collectionAddress: "", collectionPostcode: "", scheduledAt: "", deliveryAddress: "", deliveryPostcode: "", deliveryAt: "", vehicleId: "", driverId: "", instructions: "", rate: "", weightKg: "", pallets: "" };
const steps = ["Customer", "Collection", "Delivery", "Assignment", "Review"];

export function JobWizard({ onComplete, onCancel }: { onComplete: () => void; onCancel: () => void }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(initial);
  const [vehicles, setVehicles] = useState<Option[]>([]);
  const [drivers, setDrivers] = useState<Option[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((current) => ({ ...current, [key]: value }));
  const selectedVehicle = useMemo(() => vehicles.find((item) => item.id === form.vehicleId)?.label ?? "Unassigned", [vehicles, form.vehicleId]);
  const selectedDriver = useMemo(() => drivers.find((item) => item.id === form.driverId)?.label ?? "Unassigned", [drivers, form.driverId]);

  useEffect(() => {
    Promise.all([api<Vehicle[]>("/vehicles"), api<Driver[]>("/drivers")])
      .then(([vehicleRows, driverRows]) => {
        setVehicles(vehicleRows.filter((vehicle) => vehicle.status !== "INACTIVE").map((vehicle) => ({ id: vehicle.id, label: `${vehicle.registration}${vehicle.fleetNumber ? ` · Fleet ${vehicle.fleetNumber}` : ""}` })));
        setDrivers(driverRows.filter((driver) => driver.isActive !== false).map((driver) => ({ id: driver.id, label: `${driver.firstName} ${driver.lastName}` })));
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load vehicles and drivers."));
  }, []);

  function validate() {
    if (step === 0 && (!form.reference.trim() || !form.customerName.trim())) return "Job reference and customer are required.";
    if (step === 1 && (!form.collectionAddress.trim() || !form.scheduledAt)) return "Collection address and date/time are required.";
    if (step === 2 && !form.deliveryAddress.trim()) return "Delivery address is required.";
    if (step === 2 && form.deliveryAt && form.scheduledAt && new Date(form.deliveryAt) < new Date(form.scheduledAt)) return "Delivery cannot be before collection.";
    if (step === 3 && form.rate && Number(form.rate) < 0) return "Rate cannot be negative.";
    if (step === 3 && form.weightKg && Number(form.weightKg) < 0) return "Weight cannot be negative.";
    if (step === 3 && form.pallets && (!Number.isInteger(Number(form.pallets)) || Number(form.pallets) < 0)) return "Pallets must be a whole number.";
    return "";
  }

  function next() {
    const problem = validate();
    if (problem) return setError(problem);
    setError("");
    setStep((value) => Math.min(value + 1, steps.length - 1));
  }

  async function save() {
    const problem = validate();
    if (problem) return setError(problem);
    setSaving(true);
    setError("");
    try {
      await api("/jobs", { method: "POST", body: JSON.stringify({
        reference: form.reference.trim(), customerName: form.customerName.trim(), collectionAddress: form.collectionAddress.trim(),
        collectionPostcode: form.collectionPostcode.trim() || undefined, scheduledAt: form.scheduledAt,
        deliveryAddress: form.deliveryAddress.trim(), deliveryPostcode: form.deliveryPostcode.trim() || undefined,
        deliveryAt: form.deliveryAt || undefined, vehicleId: form.vehicleId || undefined, driverId: form.driverId || undefined,
        instructions: form.instructions.trim() || undefined, rate: form.rate ? Number(form.rate) : undefined,
        weightKg: form.weightKg ? Number(form.weightKg) : undefined, pallets: form.pallets ? Number(form.pallets) : undefined,
      }) });
      onComplete();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create the job.");
    } finally { setSaving(false); }
  }

  return <section className="panel" style={{ marginBottom: 24 }}>
    <div className="panel-heading" style={{ padding: 20 }}><div><p className="eyebrow">Job setup</p><h2>Create job</h2><p className="subtle">Record the work once, then assign the vehicle and driver when ready.</p></div></div>
    <div style={{ display: "flex", gap: 6, padding: "0 20px 18px", flexWrap: "wrap" }}>{steps.map((label, index) => <span key={label} style={{ padding: "6px 10px", borderRadius: 999, fontSize: 13, fontWeight: index === step ? 700 : 500, opacity: index === step ? 1 : .55, border: "1px solid currentColor" }}>{index + 1}. {label}</span>)}</div>
    <div style={{ padding: "0 20px 20px", display: "grid", gap: 16 }}>
      {error && <p role="alert" className="form-message error">{error}</p>}
      {step === 0 && <div className="form-grid"><label>Job reference *<input autoFocus required maxLength={80} value={form.reference} onChange={(event) => set("reference", event.target.value)} placeholder="JOB-1001" /></label><label>Customer *<input required maxLength={160} value={form.customerName} onChange={(event) => set("customerName", event.target.value)} placeholder="Customer name" /></label></div>}
      {step === 1 && <div className="form-grid"><label>Collection address *<textarea rows={3} required value={form.collectionAddress} onChange={(event) => set("collectionAddress", event.target.value)} /></label><label>Collection postcode<input maxLength={20} value={form.collectionPostcode} onChange={(event) => set("collectionPostcode", event.target.value)} /></label><label>Collection date & time *<input type="datetime-local" required value={form.scheduledAt} onChange={(event) => set("scheduledAt", event.target.value)} /></label></div>}
      {step === 2 && <div className="form-grid"><label>Delivery address *<textarea rows={3} required value={form.deliveryAddress} onChange={(event) => set("deliveryAddress", event.target.value)} /></label><label>Delivery postcode<input maxLength={20} value={form.deliveryPostcode} onChange={(event) => set("deliveryPostcode", event.target.value)} /></label><label>Expected delivery date & time<input type="datetime-local" min={form.scheduledAt || undefined} value={form.deliveryAt} onChange={(event) => set("deliveryAt", event.target.value)} /></label></div>}
      {step === 3 && <div style={{ display: "grid", gap: 16 }}><div className="form-grid"><label>Vehicle<select value={form.vehicleId} onChange={(event) => set("vehicleId", event.target.value)}><option value="">Unassigned</option>{vehicles.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label>Driver<select value={form.driverId} onChange={(event) => set("driverId", event.target.value)}><option value="">Unassigned</option>{drivers.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label>Agreed rate (£)<input type="number" min="0" step="0.01" value={form.rate} onChange={(event) => set("rate", event.target.value)} /></label><label>Weight (kg)<input type="number" min="0" step="0.01" value={form.weightKg} onChange={(event) => set("weightKg", event.target.value)} /></label><label>Pallets<input type="number" min="0" step="1" value={form.pallets} onChange={(event) => set("pallets", event.target.value)} /></label></div><label>Instructions<textarea rows={4} maxLength={4000} value={form.instructions} onChange={(event) => set("instructions", event.target.value)} /></label></div>}
      {step === 4 && <div style={{ display: "grid", gap: 12 }}><div className="metric-card"><div className="metric-icon violet"><ClipboardList size={21} /></div><div><p>Job</p><strong>{form.reference}</strong><small>{form.customerName}</small></div></div><div className="panel" style={{ padding: 16 }}><p><strong>Collection:</strong> {form.collectionAddress} · {new Date(form.scheduledAt).toLocaleString("en-GB")}</p><p><strong>Delivery:</strong> {form.deliveryAddress}{form.deliveryAt ? ` · ${new Date(form.deliveryAt).toLocaleString("en-GB")}` : ""}</p><p><strong>Vehicle:</strong> {selectedVehicle}</p><p><strong>Driver:</strong> {selectedDriver}</p>{form.instructions && <p><strong>Instructions:</strong> {form.instructions}</p>}</div></div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 4 }}><button type="button" className="switch-mode" disabled={saving} onClick={step === 0 ? onCancel : () => { setError(""); setStep((value) => value - 1); }}><ArrowLeft size={17} /> {step === 0 ? "Cancel" : "Back"}</button>{step < steps.length - 1 ? <button type="button" className="primary-button" onClick={next}>Next <ArrowRight size={17} /></button> : <button type="button" className="primary-button" disabled={saving} onClick={() => void save()}><Check size={17} /> {saving ? "Creating…" : "Create job"}</button>}</div>
    </div>
  </section>;
}
