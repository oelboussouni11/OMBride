"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchFareConfig, updateFareConfig, type FareConfig } from "@/lib/api";

export default function FareConfigPage() {
  const [config, setConfig] = useState<FareConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState({
    base_fare: "",
    price_per_km: "",
    price_per_min: "",
    booking_fee: "",
    minimum_fare: "",
    commission_per_ride: "",
    commission_type: "fixed",
    weight_rating: "",
    weight_distance: "",
  });

  useEffect(() => {
    fetchFareConfig()
      .then((c) => {
        setConfig(c);
        setForm({
          base_fare: c.base_fare.toString(),
          price_per_km: c.price_per_km.toString(),
          price_per_min: c.price_per_min.toString(),
          booking_fee: c.booking_fee.toString(),
          minimum_fare: c.minimum_fare.toString(),
          commission_per_ride: c.commission_per_ride.toString(),
          commission_type: c.commission_type || "fixed",
          weight_rating: (c.weight_rating ?? 1).toString(),
          weight_distance: (c.weight_distance ?? 0.5).toString(),
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const updated = await updateFareConfig({
        base_fare: parseFloat(form.base_fare),
        price_per_km: parseFloat(form.price_per_km),
        price_per_min: parseFloat(form.price_per_min),
        booking_fee: parseFloat(form.booking_fee),
        minimum_fare: parseFloat(form.minimum_fare),
        commission_per_ride: parseFloat(form.commission_per_ride),
        commission_type: form.commission_type,
        weight_rating: parseFloat(form.weight_rating),
        weight_distance: parseFloat(form.weight_distance),
      });
      setConfig(updated);
      setSuccess("Configuration saved successfully");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-zinc-500">Loading...</p>;

  const fareFields = [
    { key: "base_fare", label: "Base Fare (DH)", desc: "Fixed charge per ride" },
    { key: "price_per_km", label: "Price per Kilometer (DH)", desc: "Distance-based charge" },
    { key: "price_per_min", label: "Price per Minute (DH)", desc: "Time-based charge" },
    { key: "booking_fee", label: "Booking Fee (DH)", desc: "Flat booking fee" },
    { key: "minimum_fare", label: "Minimum Fare (DH)", desc: "Floor price for any ride" },
  ] as const;

  const wr = parseFloat(form.weight_rating) || 1;
  const wd = parseFloat(form.weight_distance) || 0.5;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Fare Configuration</h1>
        {config && (
          <p className="text-sm text-zinc-500 mt-1">
            Last updated: {new Date(config.updated_at).toLocaleString()}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        {/* Fare Parameters */}
        <Card>
          <CardHeader>
            <CardTitle>Fare Parameters</CardTitle>
            <CardDescription>Set pricing for rides</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {fareFields.map((f) => (
              <div key={f.key} className="space-y-1">
                <label htmlFor={f.key} className="text-sm font-medium text-zinc-900">
                  {f.label}
                </label>
                <Input
                  id={f.key}
                  type="number"
                  step="0.01"
                  min="0"
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  required
                />
                <p className="text-xs text-zinc-400">{f.desc}</p>
              </div>
            ))}

            {/* Commission */}
            <div className="rounded-lg border border-zinc-200 p-4 space-y-3">
              <p className="text-sm font-medium text-zinc-900">Commission per Ride</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, commission_type: "fixed" })}
                  className={`flex-1 rounded-md border-2 py-2 text-sm font-semibold transition-colors ${
                    form.commission_type === "fixed"
                      ? "border-zinc-900 bg-zinc-50 text-zinc-900"
                      : "border-zinc-200 text-zinc-400"
                  }`}
                >
                  Fixed (DH)
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, commission_type: "percentage" })}
                  className={`flex-1 rounded-md border-2 py-2 text-sm font-semibold transition-colors ${
                    form.commission_type === "percentage"
                      ? "border-zinc-900 bg-zinc-50 text-zinc-900"
                      : "border-zinc-200 text-zinc-400"
                  }`}
                >
                  Percentage (%)
                </button>
              </div>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.commission_per_ride}
                onChange={(e) => setForm({ ...form, commission_per_ride: e.target.value })}
                required
              />
              <p className="text-xs text-zinc-400">
                {form.commission_type === "percentage"
                  ? `${form.commission_per_ride || 0}% of the ride fare will be deducted. E.g. on a 50 DH ride: ${((parseFloat(form.commission_per_ride) || 0) * 50 / 100).toFixed(2)} DH`
                  : `${form.commission_per_ride || 0} DH will be deducted per ride regardless of fare.`}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Driver Matching Weights */}
        <Card>
          <CardHeader>
            <CardTitle>Driver Matching Formula</CardTitle>
            <CardDescription>
              Controls how drivers are prioritized when a ride is requested.
              The formula is: <code className="bg-zinc-100 px-1.5 py-0.5 rounded text-xs font-mono">score = (rating x weight_rating) - (distance_km x weight_distance)</code>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="weight_rating" className="text-sm font-medium text-zinc-900">
                Rating Weight
              </label>
              <Input
                id="weight_rating"
                type="number"
                step="0.1"
                min="0"
                max="10"
                value={form.weight_rating}
                onChange={(e) => setForm({ ...form, weight_rating: e.target.value })}
                required
              />
              <p className="text-xs text-zinc-400">
                Higher = better-rated drivers get priority. Set to 0 to ignore rating.
              </p>
            </div>

            <div className="space-y-1">
              <label htmlFor="weight_distance" className="text-sm font-medium text-zinc-900">
                Distance Weight
              </label>
              <Input
                id="weight_distance"
                type="number"
                step="0.1"
                min="0"
                max="10"
                value={form.weight_distance}
                onChange={(e) => setForm({ ...form, weight_distance: e.target.value })}
                required
              />
              <p className="text-xs text-zinc-400">
                Higher = closer drivers get more priority. Set to 0 to ignore distance.
              </p>
            </div>

            {/* Live formula preview */}
            <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-4 space-y-2">
              <p className="text-sm font-medium text-zinc-700">Example with current weights:</p>
              <div className="text-xs text-zinc-500 space-y-1 font-mono">
                <p>Driver A: 4.8 stars, 1km away = ({(4.8 * wr).toFixed(1)}) - ({(1 * wd).toFixed(1)}) = <span className="font-bold text-zinc-900">{(4.8 * wr - 1 * wd).toFixed(1)}</span></p>
                <p>Driver B: 3.5 stars, 0.2km away = ({(3.5 * wr).toFixed(1)}) - ({(0.2 * wd).toFixed(1)}) = <span className="font-bold text-zinc-900">{(3.5 * wr - 0.2 * wd).toFixed(1)}</span></p>
                <p className="pt-1 text-zinc-700">
                  {(4.8 * wr - 1 * wd) > (3.5 * wr - 0.2 * wd)
                    ? "Driver A gets offered first (higher rated)"
                    : "Driver B gets offered first (closer)"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {error && <p className="text-sm text-red-500">{error}</p>}
        {success && <p className="text-sm text-green-600">{success}</p>}

        <Button type="submit" disabled={saving} className="w-full sm:w-auto">
          {saving ? "Saving..." : "Save Configuration"}
        </Button>
      </form>
    </div>
  );
}
