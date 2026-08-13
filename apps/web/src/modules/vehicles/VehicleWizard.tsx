import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Truck } from "lucide-react";
import { api } from "../../lib/api";
import { VEHICLE_TYPES, VehicleType, requiresTachoCalibration, validateDateOrder } from "./vehicleRules";

type Form = {
  type: VehicleType;
  registration: string;
  fleetNumber: string;
  make: string;
  model: string;
  year: string;
  vin: string;
  firstRegisteredAt: string;
  acquiredAt: string;
  motDue: string;
  taxDue: string;
  insuranceDue: string;
  tachoCalibrationDue: string;
  mileage: string;
  fuelType: string;
  colour: string;
  depot: string;
  notes: string;
};

const initial: Form = {
  type: "TRUCK", registration: "", fleetNumber: "", make: "", model: "", year: "", vin: "",
  firstRegisteredAt: "", acquiredAt: "", motDue: "", taxDue: "", insuranceDue: "", tachoCalibrationDue: "",
  mileage: "", fuelType: "", colour: "", depot: "", notes: "",
};

const steps = ["Type", "Identity", "Dates", "Compliance", "Details", "Review"];

export function VehicleWizard({ onComplete, onCancel }: { onComplete: () => void; onCancel: () => void }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const minAcquired = form.firstRegisteredAt || undefined;
  const dateError = useMemo(() => validateDateOrder(form.firstRegisteredAt, form.acquiredAt), [form.firstRegisteredAt, form.acquiredAt]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((current) => ({ ...current, [key]: value }));

  function validateCurrentStep() {
    setError(null);
    if (step === 0 && !form.type) return "Choose a vehicle type.";
    if (step === 1 && !form.registration.trim()) return "Enter the vehicle registration before continuing.";
    if (step === 2) {
      if (!form.firstRegisteredAt || !form.acquiredAt) return "First registration and acquired dates are required.";
      if (dateError) return dateError;
    }
    if (step === 3) {
      if (!form.motDue || !form.insuranceDue) return "MOT/test and insurance due dates are required before the vehicle can be saved.";
      if (requiresTachoCalibration(form.type) && !form.tachoCalibrationDue) return "Tacho calibration due date is required for an HGV / Truck record.";
    }
    return null;
  }

  function next() {
    const problem = validateCurrentStep();
    if (problem) { setError(problem); return; }
    setStep((value) => Math.min(value + 1, steps.length - 1));
  }

  async function save() {
    const problem = validateCurrentStep();
    if (problem) { setError(problem); return; }
    setSaving(true); setError(null);
    try {
      await api("/vehicles", {
        method: "POST",
        body: JSON.stringify({
          registration: form.registration.trim().toUpperCase(), fleetNumber: form.fleetNumber.trim() || undefined,
          vin: form.vin.trim() || undefined, type: form.type, make: form.make.trim() || undefined,
          model: form.model.trim() || undefined, year: form.year ? Number(form.year) : undefined,
          firstRegisteredAt: form.firstRegisteredAt || undefined, acquiredAt: form.acquiredAt || undefined,
          motDue: form.motDue || undefined, taxDue: form.taxDue || undefined, insuranceDue: form.insuranceDue || undefined,
          tachoCalibrationDue: form.tachoCalibrationDue || undefined, mileage: form.mileage ? Number(form.mileage) : undefined,
          fuelType: form.fuelType.trim() || undefined, colour: form.colour.trim() || undefined,
          depot: form.depot.trim() || undefined, notes: form.notes.trim() || undefined,
        }),
      });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save vehicle.");
    } finally { setSaving(false); }
  }

  return (
    <section className="panel" style={{ marginBottom: 24 }}>
      <div className="panel-heading" style={{ padding: 20 }}>
        <div><p className="eyebrow">Vehicle setup</p><h2>Add vehicle</h2><p className="subtle">FleetOS asks only for information relevant to the vehicle type.</p></div>
      </div>
      <div style={{ display: "flex", gap: 6, padding: "0 20px 18px", flexWrap: "wrap" }}>
        {steps.map((label, index) => <span key={label} style={{ padding: "6px 10px", borderRadius: 999, fontSize: 13, fontWeight: index === step ? 700 : 500, opacity: index === step ? 1 : 0.55, border: "1px solid currentColor" }}>{index + 1}. {label}</span>)}
      </div>
      <div style={{ padding: "0 20px 20px", display: "grid", gap: 16 }}>
        {error && <p role="alert" className="form-message error">{error}</p>}
        {step === 0 && <div style={{ display: "grid", gap: 10 }}>
          <h3>What are you adding?</h3>
          {VEHICLE_TYPES.map((item) => <button key={item.value} type="button" className="panel" onClick={() => set("type", item.value)} style={{ textAlign: "left", padding: 16, border: form.type === item.value ? "2px solid currentColor" : "1px solid currentColor", cursor: "pointer" }}><strong>{item.label}</strong><p className="subtle">{item.description}</p></button>)}
        </div>}
        {step === 1 && <div className="form-grid">
          <label>Registration *<input required value={form.registration} onChange={(e) => set("registration", e.target.value)} placeholder="AB12 CDE" /></label>
          <label>Fleet number<input value={form.fleetNumber} onChange={(e) => set("fleetNumber", e.target.value)} placeholder="Optional" /></label>
          <label>Make<input value={form.make} onChange={(e) => set("make", e.target.value)} /></label>
          <label>Model<input value={form.model} onChange={(e) => set("model", e.target.value)} /></label>
          <label>Year<input type="number" min="1900" max={new Date().getFullYear() + 1} value={form.year} onChange={(e) => set("year", e.target.value)} /></label>
          <label>VIN / chassis<input value={form.vin} onChange={(e) => set("vin", e.target.value)} /></label>
        </div>}
        {step === 2 && <div className="form-grid">
          <label>First registered *<input type="date" max={today} value={form.firstRegisteredAt} onChange={(e) => set("firstRegisteredAt", e.target.value)} /></label>
          <label>Acquired by company *<input type="date" min={minAcquired} max={today} value={form.acquiredAt} onChange={(e) => set("acquiredAt", e.target.value)} /></label>
          <p className="subtle" style={{ gridColumn: "1 / -1" }}>Dates are validated. FleetOS will not silently accept an impossible date sequence.</p>
        </div>}
        {step === 3 && <div className="form-grid">
          <label>MOT / test due *<input type="date" min={form.firstRegisteredAt || undefined} value={form.motDue} onChange={(e) => set("motDue", e.target.value)} /></label>
          <label>Insurance due *<input type="date" min={form.acquiredAt || undefined} value={form.insuranceDue} onChange={(e) => set("insuranceDue", e.target.value)} /></label>
          <label>Tax due<input type="date" min={form.firstRegisteredAt || undefined} value={form.taxDue} onChange={(e) => set("taxDue", e.target.value)} /></label>
          {requiresTachoCalibration(form.type) && <label>Tacho calibration due *<input type="date" min={form.firstRegisteredAt || undefined} value={form.tachoCalibrationDue} onChange={(e) => set("tachoCalibrationDue", e.target.value)} /></label>}
          <p className="subtle" style={{ gridColumn: "1 / -1" }}>These are FleetOS record requirements for this build. A recorded date is not itself proof of legal compliance.</p>
        </div>}
        {step === 4 && <div className="form-grid">
          <label>Mileage<input type="number" min="0" step="1" value={form.mileage} onChange={(e) => set("mileage", e.target.value)} /></label>
          <label>Fuel / power type<input value={form.fuelType} onChange={(e) => set("fuelType", e.target.value)} placeholder="Diesel, electric…" /></label>
          <label>Colour<input value={form.colour} onChange={(e) => set("colour", e.target.value)} /></label>
          <label>Depot / base<input value={form.depot} onChange={(e) => set("depot", e.target.value)} /></label>
          <label style={{ gridColumn: "1 / -1" }}>Notes<textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={4} /></label>
        </div>}
        {step === 5 && <div style={{ display: "grid", gap: 10 }}>
          <div className="metric-card"><div className="metric-icon blue"><Truck size={21} /></div><div><p>Vehicle</p><strong>{form.registration.toUpperCase()}</strong><small>{VEHICLE_TYPES.find((x) => x.value === form.type)?.label} · {form.make || "Make not recorded"} {form.model}</small></div></div>
          <div className="panel" style={{ padding: 16 }}><strong>Dates & evidence</strong><p>First registered: {form.firstRegisteredAt || "Not recorded"}</p><p>Acquired: {form.acquiredAt || "Not recorded"}</p><p>MOT/test due: {form.motDue || "Not recorded"}</p><p>Insurance due: {form.insuranceDue || "Not recorded"}</p></div>
        </div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 4 }}>
          <button type="button" className="switch-mode" onClick={step === 0 ? onCancel : () => setStep((value) => value - 1)}><ArrowLeft size={17} /> {step === 0 ? "Cancel" : "Back"}</button>
          {step < steps.length - 1 ? <button type="button" className="primary-button" onClick={next}>Next <ArrowRight size={17} /></button> : <button type="button" className="primary-button" disabled={saving} onClick={save}><Check size={17} /> {saving ? "Saving…" : "Save vehicle"}</button>}
        </div>
      </div>
    </section>
  );
}
