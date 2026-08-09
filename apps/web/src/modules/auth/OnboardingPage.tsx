import { useState } from "react";
import { api } from "../../lib/api";

type Step = 1 | 2 | 3 | 4 | 5 | 6;

const industries = [
  {
    id: "HAULAGE",
    label: "Haulage",
    description: "HGV, transport and general haulage",
  },
  {
    id: "LOGISTICS",
    label: "Logistics",
    description: "Deliveries, distribution and logistics",
  },
  {
    id: "DRAINAGE",
    label: "Drainage",
    description: "Drainage, jetting and sewer work",
  },
  {
    id: "CONSTRUCTION",
    label: "Construction",
    description: "Construction and site operations",
  },
  {
    id: "UTILITIES",
    label: "Utilities",
    description: "Water, gas, power and infrastructure",
  },
  {
    id: "PLANT",
    label: "Plant & machinery",
    description: "Plant hire and heavy equipment",
  },
  {
    id: "SERVICE",
    label: "Service business",
    description: "Field service and mobile teams",
  },
  {
    id: "OTHER",
    label: "Something else",
    description: "Another type of operation",
  },
] as const;

const roles = [
  {
    id: "DRIVER",
    label: "Driver / Operator",
  },
  {
    id: "WORKSHOP_TECHNICIAN",
    label: "Workshop / Technician",
  },
  {
    id: "TRANSPORT_PLANNER",
    label: "Transport Planner",
  },
  {
    id: "TRANSPORT_MANAGER",
    label: "Transport Manager",
  },
  {
    id: "OFFICE_STAFF",
    label: "Office / Admin",
  },
  {
    id: "FINANCE",
    label: "Finance",
  },
  {
    id: "COMPANY_ADMIN",
    label: "Company Owner / Admin",
  },
] as const;

const teamSizes = [
  "Just me",
  "2–5 people",
  "6–20 people",
  "21–50 people",
  "51–100 people",
  "100+ people",
];

const totalSteps = 6;

export function OnboardingPage({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const [step, setStep] = useState<Step>(1);

  const [companyName, setCompanyName] = useState("");
  const [industriesSelected, setIndustriesSelected] = useState<string[]>([]);
  const [role, setRole] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [registration, setRegistration] = useState("");
  const [vehicleType, setVehicleType] = useState("TRUCK");

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function toggleIndustry(id: string) {
    setIndustriesSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  function next() {
    setError("");

    if (step === 2 && industriesSelected.length === 0) {
      setError("Choose at least one type of work.");
      return;
    }

    if (step === 3 && !companyName.trim()) {
      setError("Enter your company name.");
      return;
    }

    if (step === 4 && !role) {
      setError("Choose your role.");
      return;
    }

    setStep((current) =>
      Math.min(totalSteps, current + 1) as Step
    );
  }

  function back() {
    setError("");

    setStep((current) =>
      Math.max(1, current - 1) as Step
    );
  }

  async function finish() {
    if (busy) {
      return;
    }

    if (!companyName.trim()) {
      setStep(3);
      setError("Enter your company name.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      await api("/onboarding/company", {
        method: "POST",
        body: JSON.stringify({
          companyName: companyName.trim(),

          industries: industriesSelected,

          role,

          teamSize,

          vehicle: registration.trim()
            ? {
                registration: registration
                  .trim()
                  .toUpperCase(),
                type: vehicleType,
              }
            : undefined,
        }),
      });

      onComplete();
    } catch (err: unknown) {
      console.error("FleetOS onboarding failed:", err);

      const status =
        typeof err === "object" &&
        err !== null &&
        "status" in err
          ? (err as { status?: number }).status
          : undefined;

      const message =
        err instanceof Error
          ? err.message
          : "We couldn't finish setting up FleetOS.";

      if (status === 401) {
        setError(
          "Your session has expired. Please sign in again."
        );
      } else if (status === 409) {
        onComplete();
      } else if (status === 400) {
        setError(message);
      } else if (status === 500) {
        setError(
          "FleetOS couldn't save your workspace. Please try again."
        );
      } else {
        setError(
          "We couldn't connect to FleetOS. Check your connection and try again."
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="onboarding-page">
      <section className="onboarding-shell">
        <header className="onboarding-header">
          <div className="brand">
            <span className="brand-mark">F</span>
            <span>FleetOS</span>
          </div>

          {step > 1 && (
            <div className="onboarding-progress">
              <div className="onboarding-progress-label">
                <span>Getting you set up</span>
                <strong>
                  {step} / {totalSteps}
                </strong>
              </div>

              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{
                    width: `${(step / totalSteps) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}
        </header>

        <div className="onboarding-card">
          {step === 1 && (
            <div className="onboarding-step">
              <div className="onboarding-icon">👋</div>

              <p className="eyebrow">
                Welcome to FleetOS
              </p>

              <h1>
                Let's get your operation set up.
              </h1>

              <p className="onboarding-lead">
                FleetOS brings your people, vehicles,
                jobs, workshop and compliance together
                without adding another mountain of admin.
              </p>

              <button
                type="button"
                className="primary-button onboarding-button"
                onClick={() => {
                  setError("");
                  setStep(2);
                }}
              >
                Let's get started
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="onboarding-step">
              <p className="eyebrow">
                Your operation
              </p>

              <h1>
                What kind of work do you do?
              </h1>

              <p className="onboarding-lead">
                Pick everything that applies. FleetOS
                will adapt around the way you work.
              </p>

              <div className="choice-grid">
                {industries.map((item) => {
                  const selected =
                    industriesSelected.includes(item.id);

                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={`choice-card ${
                        selected ? "selected" : ""
                      }`}
                      onClick={() =>
                        toggleIndustry(item.id)
                      }
                    >
                      <span className="choice-check">
                        {selected ? "✓" : ""}
                      </span>

                      <strong>{item.label}</strong>

                      <small>
                        {item.description}
                      </small>
                    </button>
                  );
                })}
              </div>

              {error && (
                <p className="form-message error">
                  {error}
                </p>
              )}

              <div className="onboarding-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={back}
                >
                  Back
                </button>

                <button
                  type="button"
                  className="primary-button"
                  onClick={next}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="onboarding-step">
              <p className="eyebrow">
                Your company
              </p>

              <h1>
                What's the business called?
              </h1>

              <p className="onboarding-lead">
                This becomes your private FleetOS
                workspace.
              </p>

              <label className="onboarding-field">
                <span>Company name</span>

                <input
                  autoFocus
                  value={companyName}
                  onChange={(event) =>
                    setCompanyName(event.target.value)
                  }
                  placeholder="e.g. Northstar Haulage"
                  autoComplete="organization"
                />
              </label>

              {error && (
                <p className="form-message error">
                  {error}
                </p>
              )}

              <div className="onboarding-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={back}
                >
                  Back
                </button>

                <button
                  type="button"
                  className="primary-button"
                  onClick={next}
                  disabled={!companyName.trim()}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="onboarding-step">
              <p className="eyebrow">
                Your role
              </p>

              <h1>
                What do you do in the business?
              </h1>

              <p className="onboarding-lead">
                This helps FleetOS put the right
                information in front of you.
              </p>

              <div className="role-list">
                {roles.map((item) => {
                  const selected =
                    role === item.id;

                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={`role-card ${
                        selected ? "selected" : ""
                      }`}
                      onClick={() =>
                        setRole(item.id)
                      }
                    >
                      <span className="role-indicator">
                        {selected ? "✓" : ""}
                      </span>

                      <strong>{item.label}</strong>
                    </button>
                  );
                })}
              </div>

              {error && (
                <p className="form-message error">
                  {error}
                </p>
              )}

              <div className="onboarding-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={back}
                >
                  Back
                </button>

                <button
                  type="button"
                  className="primary-button"
                  onClick={next}
                  disabled={!role}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="onboarding-step">
              <p className="eyebrow">
                Your team
              </p>

              <h1>
                How big is the operation?
              </h1>

              <p className="onboarding-lead">
                This is only a starting point. You can
                change your team later.
              </p>

              <div className="team-grid">
                {teamSizes.map((size) => {
                  const selected =
                    teamSize === size;

                  return (
                    <button
                      type="button"
                      key={size}
                      className={`team-card ${
                        selected ? "selected" : ""
                      }`}
                      onClick={() =>
                        setTeamSize(size)
                      }
                    >
                      {size}
                    </button>
                  );
                })}
              </div>

              {error && (
                <p className="form-message error">
                  {error}
                </p>
              )}

              <div className="onboarding-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={back}
                >
                  Back
                </button>

                <button
                  type="button"
                  className="primary-button"
                  onClick={next}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="onboarding-step">
              <p className="eyebrow">
                First vehicle
              </p>

              <h1>
                Want to add a vehicle now?
              </h1>

              <p className="onboarding-lead">
                It's optional. Add one now or jump
                straight into FleetOS and build your
                fleet later.
              </p>

              <label className="onboarding-field">
                <span>Registration</span>

                <input
                  value={registration}
                  onChange={(event) =>
                    setRegistration(event.target.value)
                  }
                  placeholder="e.g. AB12 CDE"
                  autoCapitalize="characters"
                />
              </label>

              {registration.trim() && (
                <label className="onboarding-field">
                  <span>Vehicle type</span>

                  <select
                    value={vehicleType}
                    onChange={(event) =>
                      setVehicleType(event.target.value)
                    }
                  >
                    <option value="TRUCK">
                      Truck / HGV
                    </option>

                    <option value="VAN">
                      Van
                    </option>

                    <option value="TRAILER">
                      Trailer
                    </option>

                    <option value="CAR">
                      Car
                    </option>

                    <option value="OTHER">
                      Other
                    </option>
                  </select>
                </label>
              )}

              {error && (
                <p className="form-message error">
                  {error}
                </p>
              )}

              <div className="onboarding-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={back}
                  disabled={busy}
                >
                  Back
                </button>

                <button
                  type="button"
                  className="primary-button"
                  onClick={finish}
                  disabled={busy}
                >
                  {busy
                    ? "Setting up FleetOS..."
                    : "Finish setup"}
                </button>
              </div>

              <p className="onboarding-note">
                You can add drivers, vehicles, jobs and
                compliance records after setup.
              </p>
            </div>
          )}
        </div>

        <footer className="onboarding-footer">
          <span>
            Built around the people doing the work.
          </span>
        </footer>
      </section>
    </main>
  );
}