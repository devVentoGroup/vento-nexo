"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

type ValidationStatus = "pending" | "validated" | "failed" | "requires_action";
type AccessibilityLevel = "easy" | "restricted" | "hazard";

interface ValidationFormData {
  locationId: string;
  status: ValidationStatus;
  codeVerified: boolean;
  codeLocationDescription: string;
  capacityVerified: boolean;
  capacityUnitsActual: number;
  capacityWeightKgActual: number;
  dimensionsVerified: boolean;
  dimensionLengthCm: number;
  dimensionWidthCm: number;
  dimensionHeightCm: number;
  environmentVerified: boolean;
  environmentTypeVerified: string;
  temperatureCelsius: number;
  humidityPercent: number;
  accessibilityLevel: AccessibilityLevel;
  equipmentAvailable: string[];
  shelvingType: string;
  surfaceCondition: string;
  issues: string[];
  requiredActions: string;
  auditorNotes: string;
  photoUrls: string[];
}

interface Location {
  id: string;
  code: string;
  description: string;
  site_id: string;
}

type EmployeeContext = {
  site_id?: string | null;
};

export function LocationsValidationClient({
  employee,
  supabaseUrl,
}: {
  employee?: EmployeeContext | null;
  supabaseUrl: string;
}) {
  const [formData, setFormData] = useState<ValidationFormData>({
    locationId: "",
    status: "pending",
    codeVerified: false,
    codeLocationDescription: "",
    capacityVerified: false,
    capacityUnitsActual: 0,
    capacityWeightKgActual: 0,
    dimensionsVerified: false,
    dimensionLengthCm: 0,
    dimensionWidthCm: 0,
    dimensionHeightCm: 0,
    environmentVerified: false,
    environmentTypeVerified: "",
    temperatureCelsius: 0,
    humidityPercent: 0,
    accessibilityLevel: "easy",
    equipmentAvailable: [],
    shelvingType: "",
    surfaceCondition: "",
    issues: [],
    requiredActions: "",
    auditorNotes: "",
    photoUrls: [],
  });

  const [currentIssue, setCurrentIssue] = useState("");
  const [currentEquipment, setCurrentEquipment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(true);
  const [submitMessage, setSubmitMessage] = useState("");
  const [submitError, setSubmitError] = useState("");

  // Load locations from inventory_locations table
  useEffect(() => {
    const loadLocations = async () => {
      try {
        const supabase = createClient(
          supabaseUrl,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
        );

        // Get auth token
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data: locs, error } = await supabase
          .from("inventory_locations")
          .select("id, code, description, site_id")
          .eq("site_id", employee?.site_id)
          .eq("is_active", true)
          .order("code");

        if (error) throw error;

        setLocations(locs || []);
      } catch (error) {
        console.error("Error loading locations:", error);
      } finally {
        setIsLoadingLocations(false);
      }
    };

    if (employee?.site_id) {
      loadLocations();
    }
  }, [employee?.site_id, supabaseUrl]);

  const handleAddIssue = () => {
    if (currentIssue.trim()) {
      setFormData((prev) => ({
        ...prev,
        issues: [...prev.issues, currentIssue],
      }));
      setCurrentIssue("");
    }
  };

  const handleRemoveIssue = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      issues: prev.issues.filter((_, i) => i !== index),
    }));
  };

  const handleAddEquipment = () => {
    if (currentEquipment.trim()) {
      setFormData((prev) => ({
        ...prev,
        equipmentAvailable: [...prev.equipmentAvailable, currentEquipment],
      }));
      setCurrentEquipment("");
    }
  };

  const handleRemoveEquipment = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      equipmentAvailable: prev.equipmentAvailable.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitMessage("");
    setSubmitError("");

    try {
      if (!formData.locationId) {
        throw new Error("Debes seleccionar una ubicación");
      }

      const supabase = createClient(
        supabaseUrl,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
      );

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No autenticado");

      // Get the location_id (UUID) from the code
      const selectedLocation = locations.find(
        (loc) => loc.code === formData.locationId
      );
      if (!selectedLocation) {
        throw new Error("Ubicación no encontrada");
      }

      // Insert validation record
      const { error } = await supabase
        .from("locations_validation")
        .insert({
          location_id: selectedLocation.id,
          site_id: employee?.site_id,
          status: formData.status,
          code_verified: formData.codeVerified,
          code_location_description: formData.codeLocationDescription,
          capacity_verified: formData.capacityVerified,
          capacity_units_actual: formData.capacityUnitsActual,
          capacity_weight_kg_actual: formData.capacityWeightKgActual,
          dimensions_verified: formData.dimensionsVerified,
          dimension_length_cm: formData.dimensionLengthCm,
          dimension_width_cm: formData.dimensionWidthCm,
          dimension_height_cm: formData.dimensionHeightCm,
          environment_verified: formData.environmentVerified,
          environment_type_verified: formData.environmentTypeVerified,
          temperature_celsius: formData.temperatureCelsius,
          humidity_percent: formData.humidityPercent,
          accessibility_level: formData.accessibilityLevel,
          equipment_available: formData.equipmentAvailable,
          shelving_type: formData.shelvingType,
          surface_condition: formData.surfaceCondition,
          issues: formData.issues,
          required_actions: formData.requiredActions,
          auditor_id: session.user.id,
          auditor_notes: formData.auditorNotes,
          photo_urls: formData.photoUrls,
        });

      if (error) throw error;

      // Reset form
      setFormData({
        locationId: "",
        status: "pending",
        codeVerified: false,
        codeLocationDescription: "",
        capacityVerified: false,
        capacityUnitsActual: 0,
        capacityWeightKgActual: 0,
        dimensionsVerified: false,
        dimensionLengthCm: 0,
        dimensionWidthCm: 0,
        dimensionHeightCm: 0,
        environmentVerified: false,
        environmentTypeVerified: "",
        temperatureCelsius: 0,
        humidityPercent: 0,
        accessibilityLevel: "easy",
        equipmentAvailable: [],
        shelvingType: "",
        surfaceCondition: "",
        issues: [],
        requiredActions: "",
        auditorNotes: "",
        photoUrls: [],
      });

      setSubmitMessage(`✓ Validación guardada para ${selectedLocation.code}`);
      setTimeout(() => setSubmitMessage(""), 3000);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error al guardar";
      setSubmitError(message);
      console.error("Submit error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!employee) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="ui-panel w-full max-w-md text-center">
          <h1 className="ui-h1">Error de acceso</h1>
          <p className="mt-2 ui-body-muted">No se pudo cargar tu información de empleado.</p>
          <div className="mt-4">
            <Link href="/" className="ui-btn ui-btn--brand">
              Volver al inicio
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="ui-h1">Validación de LOCs (Ubicaciones)</h1>
              <p className="mt-1 text-sm text-gray-600">
                Auditoría física de las ubicaciones de inventario
              </p>
            </div>
            <Link href="/inventory" className="ui-btn ui-btn--ghost">
              ← Volver
            </Link>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="ui-panel">
            {/* Section 1: Identity */}
            <div className="mb-6 border-b pb-6 last:border-b-0">
              <h2 className="ui-h2 mb-4">1. Identidad y Ubicación</h2>

              <div className="space-y-4">
                <div>
                  <label className="ui-label">Código del LOC *</label>
                  {isLoadingLocations ? (
                    <div className="ui-input bg-gray-100">Cargando ubicaciones...</div>
                  ) : (
                    <select
                      value={formData.locationId}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          locationId: e.target.value,
                        }))
                      }
                      className="ui-select"
                    >
                      <option value="">Seleccionar ubicación...</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.code}>
                          {loc.code} - {loc.description}
                        </option>
                      ))}
                    </select>
                  )}
                  {locations.length === 0 && !isLoadingLocations && (
                    <p className="text-sm text-orange-600 mt-1">
                      No hay ubicaciones disponibles para tu sitio
                    </p>
                  )}
                </div>

                <div>
                  <label className="ui-label">
                    <input
                      type="checkbox"
                      checked={formData.codeVerified}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          codeVerified: e.target.checked,
                        }))
                      }
                      className="mr-2"
                    />
                    ✓ Código impreso visible en ubicación física
                  </label>
                </div>

                <div>
                  <label className="ui-label">Descripción física de ubicación *</label>
                  <textarea
                    placeholder="ej: Recepción - Puerta principal, Estante A1"
                    value={formData.codeLocationDescription}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        codeLocationDescription: e.target.value,
                      }))
                    }
                    className="ui-textarea"
                    rows={3}
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Dimensions */}
            <div className="mb-6 border-b pb-6">
              <h2 className="ui-h2 mb-4">2. Dimensiones (medir con cinta métrica)</h2>

              <div className="space-y-4">
                <div>
                  <label className="ui-label">
                    <input
                      type="checkbox"
                      checked={formData.dimensionsVerified}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          dimensionsVerified: e.target.checked,
                        }))
                      }
                      className="mr-2"
                    />
                    ✓ Medidas verificadas en sitio
                  </label>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="ui-label">Largo (cm)</label>
                    <input
                      type="number"
                      value={formData.dimensionLengthCm}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          dimensionLengthCm: parseInt(e.target.value) || 0,
                        }))
                      }
                      className="ui-input"
                    />
                  </div>
                  <div>
                    <label className="ui-label">Ancho (cm)</label>
                    <input
                      type="number"
                      value={formData.dimensionWidthCm}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          dimensionWidthCm: parseInt(e.target.value) || 0,
                        }))
                      }
                      className="ui-input"
                    />
                  </div>
                  <div>
                    <label className="ui-label">Alto (cm)</label>
                    <input
                      type="number"
                      value={formData.dimensionHeightCm}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          dimensionHeightCm: parseInt(e.target.value) || 0,
                        }))
                      }
                      className="ui-input"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Capacity */}
            <div className="mb-6 border-b pb-6">
              <h2 className="ui-h2 mb-4">3. Capacidad Física</h2>

              <div className="space-y-4">
                <div>
                  <label className="ui-label">
                    <input
                      type="checkbox"
                      checked={formData.capacityVerified}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          capacityVerified: e.target.checked,
                        }))
                      }
                      className="mr-2"
                    />
                    ✓ Capacidad verificada
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="ui-label">Cajas estándar que caben *</label>
                    <input
                      type="number"
                      value={formData.capacityUnitsActual}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          capacityUnitsActual: parseInt(e.target.value) || 0,
                        }))
                      }
                      className="ui-input"
                    />
                  </div>
                  <div>
                    <label className="ui-label">Peso máximo (kg) *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.capacityWeightKgActual}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          capacityWeightKgActual: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="ui-input"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Section 4: Environment */}
            <div className="mb-6 border-b pb-6">
              <h2 className="ui-h2 mb-4">4. Ambiente y Condiciones</h2>

              <div className="space-y-4">
                <div>
                  <label className="ui-label">
                    <input
                      type="checkbox"
                      checked={formData.environmentVerified}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          environmentVerified: e.target.checked,
                        }))
                      }
                      className="mr-2"
                    />
                    ✓ Ambiente verificado
                  </label>
                </div>

                <div>
                  <label className="ui-label">Tipo de ambiente *</label>
                  <select
                    value={formData.environmentTypeVerified}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        environmentTypeVerified: e.target.value,
                      }))
                    }
                    className="ui-select"
                  >
                    <option value="">Seleccionar...</option>
                    <option value="AMBIENT">Ambiente (temperatura normal)</option>
                    <option value="SECOS">Secos (sin humedad)</option>
                    <option value="FRIO">Frío (2-8°C)</option>
                    <option value="CONGELADO">Congelado (-18°C)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="ui-label">Temperatura actual (°C)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.temperatureCelsius}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          temperatureCelsius: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="ui-input"
                    />
                  </div>
                  <div>
                    <label className="ui-label">Humedad (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.humidityPercent}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          humidityPercent: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="ui-input"
                    />
                  </div>
                </div>

                <div>
                  <label className="ui-label">Condición de superficie *</label>
                  <select
                    value={formData.surfaceCondition}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        surfaceCondition: e.target.value,
                      }))
                    }
                    className="ui-select"
                  >
                    <option value="">Seleccionar...</option>
                    <option value="CLEAN">Limpio</option>
                    <option value="DUSTY">Polvoriento</option>
                    <option value="WET">Húmedo</option>
                    <option value="DAMAGED">Dañado</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Section 5: Accessibility & Equipment */}
            <div className="mb-6 border-b pb-6">
              <h2 className="ui-h2 mb-4">5. Accesibilidad y Equipamiento</h2>

              <div className="space-y-4">
                <div>
                  <label className="ui-label">Nivel de accesibilidad *</label>
                  <select
                    value={formData.accessibilityLevel}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        accessibilityLevel: e.target.value as AccessibilityLevel,
                      }))
                    }
                    className="ui-select"
                  >
                    <option value="easy">Fácil (carretilla directa)</option>
                    <option value="restricted">Restringido (escalera/limitado)</option>
                    <option value="hazard">Peligro (requiere aprobación especial)</option>
                  </select>
                </div>

                <div>
                  <label className="ui-label">Tipo de estantería *</label>
                  <input
                    type="text"
                    placeholder="ej: Pallet Rack, Wall Rack, Floor, Bin"
                    value={formData.shelvingType}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        shelvingType: e.target.value,
                      }))
                    }
                    className="ui-input"
                  />
                </div>

                <div>
                  <label className="ui-label mb-2">Equipamiento disponible</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="ej: Montacargas, Escalera, Carretilla"
                      value={currentEquipment}
                      onChange={(e) => setCurrentEquipment(e.target.value)}
                      className="ui-input flex-1"
                    />
                    <button
                      type="button"
                      onClick={handleAddEquipment}
                      className="ui-btn ui-btn--secondary"
                    >
                      Agregar
                    </button>
                  </div>
                  {formData.equipmentAvailable.length > 0 && (
                    <div className="space-y-1">
                      {formData.equipmentAvailable.map((equip, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between bg-blue-50 p-2 rounded"
                        >
                          <span className="text-sm">{equip}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveEquipment(idx)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Section 6: Issues & Actions */}
            <div className="mb-6 border-b pb-6">
              <h2 className="ui-h2 mb-4">6. Problemas Encontrados</h2>

              <div className="space-y-4">
                <div>
                  <label className="ui-label mb-2">Listado de problemas</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="ej: Código no visible, Humedad alta"
                      value={currentIssue}
                      onChange={(e) => setCurrentIssue(e.target.value)}
                      className="ui-input flex-1"
                    />
                    <button
                      type="button"
                      onClick={handleAddIssue}
                      className="ui-btn ui-btn--secondary"
                    >
                      Agregar
                    </button>
                  </div>
                  {formData.issues.length > 0 && (
                    <div className="space-y-1">
                      {formData.issues.map((issue, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between bg-red-50 p-2 rounded"
                        >
                          <span className="text-sm">{issue}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveIssue(idx)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="ui-label">Acciones requeridas *</label>
                  <textarea
                    placeholder="Describe las acciones necesarias para resolver problemas"
                    value={formData.requiredActions}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        requiredActions: e.target.value,
                      }))
                    }
                    className="ui-textarea"
                    rows={3}
                  />
                </div>
              </div>
            </div>

            {/* Section 7: Auditor Notes */}
            <div>
              <h2 className="ui-h2 mb-4">7. Notas del Auditor</h2>

              <div>
                <label className="ui-label">Observaciones adicionales</label>
                <textarea
                  placeholder="Cualquier observación importante..."
                  value={formData.auditorNotes}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      auditorNotes: e.target.value,
                    }))
                  }
                  className="ui-textarea"
                  rows={3}
                />
              </div>
            </div>
          </div>

          {/* Status & Submit */}
          <div className="ui-panel space-y-4">
            {submitMessage && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
                {submitMessage}
              </div>
            )}
            {submitError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                ✗ {submitError}
              </div>
            )}

            <div>
              <label className="ui-label">Estado de validación *</label>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    status: e.target.value as ValidationStatus,
                  }))
                }
                className="ui-select"
              >
                <option value="pending">Pendiente (en auditoría)</option>
                <option value="validated">Validado (OK)</option>
                <option value="requires_action">Requiere acciones</option>
                <option value="failed">Falló validación</option>
              </select>
            </div>

            <div className="flex gap-2 justify-end">
              <Link href="/inventory" className="ui-btn ui-btn--ghost">
                Cancelar
              </Link>
              <button
                type="submit"
                disabled={isSubmitting || !formData.locationId}
                className="ui-btn ui-btn--brand disabled:opacity-50"
              >
                {isSubmitting ? "Guardando..." : "Guardar validación"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
