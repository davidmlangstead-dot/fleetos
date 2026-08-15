import { ChangeEvent, useState } from "react";
import { FileSpreadsheet, Upload, CheckCircle2, AlertTriangle } from "lucide-react";
import { api } from "../../lib/api";

type Kind = "vehicles" | "drivers";
type Preview = { kind: Kind; valid: number; invalid: number; sample: Record<string, unknown>[]; errors: string[] };

const templates: Record<Kind, string> = {
  vehicles: "registration,fleet number,make,model,year,type,mileage,mot due,tax due,insurance due,tacho calibration due,depot,notes\nAB12CDE,F12,DAF,XF,2022,TRUCK,120000,2026-10-01,2026-11-01,2027-01-01,2027-03-01,Main Depot,",
  drivers: "first name,last name,email,phone,licence number,licence expiry,cpc expiry,dcpc expiry,tacho card number,tacho card expiry,medical due,postcode\nJane,Driver,jane@example.com,07123456789,DRIVER123,2028-01-01,2027-04-01,2027-04-01,CARD123,2029-02-01,2027-06-01,AB1 2CD",
};

function downloadTemplate(kind: Kind) {
  const blob = new Blob([templates[kind]], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fleetos-${kind}-import-template.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function SpreadsheetImportPage() {
  const [kind, setKind] = useState<Kind>("vehicles");
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("For now, export the Excel sheet as CSV, or paste the rows directly from Excel.");
      return;
    }
    setCsv(await file.text());
    setPreview(null); setError(""); setMessage("");
  }

  async function check() {
    setBusy(true); setError(""); setMessage("");
    try { setPreview(await api<Preview>("/imports/preview", { method: "POST", body: JSON.stringify({ kind, csv }) })); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not validate this spreadsheet."); }
    finally { setBusy(false); }
  }

  async function commit() {
    if (!preview || preview.invalid > 0 || preview.valid === 0) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api<{ imported: number }>("/imports/commit", { method: "POST", body: JSON.stringify({ kind, csv }) });
      setMessage(`${result.imported} ${kind} record${result.imported === 1 ? "" : "s"} imported.`);
      setCsv(""); setPreview(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Import failed."); }
    finally { setBusy(false); }
  }

  return <section className="page">
    <div className="page-heading"><div><p className="eyebrow">Data migration</p><h1>Spreadsheet import</h1><p className="subtle">Move existing fleet records into FleetOS without retyping them. Export Excel as CSV, upload the CSV, or paste comma-separated rows directly.</p></div></div>
    {error && <p className="form-message error">{error}</p>}{message && <p className="form-message">{message}</p>}
    <section className="panel" style={{ padding: 18, display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
        <label style={{ minWidth: 220 }}>Import type<select value={kind} onChange={(e) => { setKind(e.target.value as Kind); setPreview(null); }}><option value="vehicles">Vehicles</option><option value="drivers">Drivers</option></select></label>
        <button type="button" className="secondary-button" onClick={() => downloadTemplate(kind)}><FileSpreadsheet size={16}/> Download template</button>
        <label className="secondary-button" style={{ cursor: "pointer" }}><Upload size={16}/> Choose CSV<input hidden type="file" accept=".csv,text/csv" onChange={(e) => void readFile(e)}/></label>
      </div>
      <label>CSV / pasted Excel rows<textarea rows={14} value={csv} onChange={(e) => { setCsv(e.target.value); setPreview(null); }} placeholder={templates[kind]} style={{ width: "100%", fontFamily: "monospace" }}/></label>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><button disabled={busy || !csv.trim()} onClick={() => void check()}>Validate import</button>{preview && preview.valid > 0 && preview.invalid === 0 && <button disabled={busy} onClick={() => void commit()}><CheckCircle2 size={16}/> Import {preview.valid} record{preview.valid === 1 ? "" : "s"}</button>}</div>
    </section>
    {preview && <section className="panel" style={{ marginTop: 18, padding: 18 }}>
      <div className="panel-heading"><div><h2>Validation result</h2><p>{preview.valid} valid · {preview.invalid} needing attention</p></div></div>
      {preview.invalid > 0 ? <div><p style={{ display: "flex", gap: 8, alignItems: "center" }}><AlertTriangle size={17}/> Nothing will be imported until these are fixed.</p><ul>{preview.errors.map((item) => <li key={item}>{item}</li>)}</ul></div> : <p><CheckCircle2 size={17}/> The spreadsheet passed validation. Review the count, then import it.</p>}
      {preview.sample.length > 0 && <details><summary>Preview first {preview.sample.length} record{preview.sample.length === 1 ? "" : "s"}</summary><pre style={{ overflowX: "auto", whiteSpace: "pre-wrap" }}>{JSON.stringify(preview.sample, null, 2)}</pre></details>}
    </section>}
  </section>;
}
