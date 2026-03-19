import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Image, Alert, Platform, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { submitVerification } from "../../services/api";
import { colors, spacing, radius } from "../../constants/theme";

const CAR_BRANDS = [
  "Dacia", "Renault", "Peugeot", "Citroen", "Fiat", "Volkswagen",
  "Toyota", "Hyundai", "Kia", "Mercedes", "BMW", "Audi",
  "Ford", "Opel", "Skoda", "Seat", "Nissan", "Honda", "Other",
];

const COLORS = [
  "White", "Black", "Silver", "Grey", "Red", "Blue",
  "Brown", "Beige", "Green", "Yellow", "Orange", "Other",
];

const YEARS = Array.from({ length: 35 }, (_, i) => 2025 - i);

export default function VerificationScreen() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1: Personal
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [city, setCity] = useState("");

  // Step 2: Licence
  const [licenceNumber, setLicenceNumber] = useState("");
  const [licenceDate, setLicenceDate] = useState("");
  const [licenceExpiry, setLicenceExpiry] = useState("");
  const [licenceFront, setLicenceFront] = useState<string | null>(null);
  const [licenceBack, setLicenceBack] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);

  // Step 3: Vehicle
  const [vehicleBrand, setVehicleBrand] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [carPhoto, setCarPhoto] = useState<string | null>(null);
  const [carteGrise, setCarteGrise] = useState<string | null>(null);

  function pickImage(setter: (uri: string) => void) {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const input = document.createElement("input");
      input.type = "file"; input.accept = "image/*";
      input.onchange = (e: any) => {
        const file = e.target?.files?.[0];
        if (file) { const r = new FileReader(); r.onload = () => setter(r.result as string); r.readAsDataURL(file); }
      };
      input.click();
      return;
    }
    (async () => {
      try {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") return;
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
        if (!result.canceled && result.assets[0]) setter(result.assets[0].uri);
      } catch {}
    })();
  }

  function alert(msg: string) {
    Platform.OS === "web" ? window.alert(msg) : Alert.alert("Error", msg);
  }

  function validateStep1() {
    if (!fullName.trim()) { alert("Enter your full name"); return false; }
    if (!phone.trim()) { alert("Enter your phone number"); return false; }
    if (!age.trim()) { alert("Enter your age"); return false; }
    return true;
  }

  function validateStep2() {
    if (!licenceNumber.trim()) { alert("Enter your licence number"); return false; }
    if (!licenceExpiry.trim()) { alert("Enter licence expiry date"); return false; }
    if (!licenceFront) { alert("Upload licence front photo"); return false; }
    if (!licenceBack) { alert("Upload licence back photo"); return false; }
    if (!selfie) { alert("Upload your selfie photo"); return false; }
    return true;
  }

  function validateStep3() {
    if (!vehicleBrand) { alert("Select vehicle brand"); return false; }
    if (!vehicleModel.trim()) { alert("Enter vehicle model"); return false; }
    if (!vehicleColor) { alert("Select vehicle color"); return false; }
    if (!vehicleYear) { alert("Select vehicle year"); return false; }
    if (!plateNumber.trim()) { alert("Enter plate number"); return false; }
    if (!carPhoto) { alert("Upload car photo"); return false; }
    if (!carteGrise) { alert("Upload carte grise photo"); return false; }
    return true;
  }

  async function handleSubmit() {
    if (!validateStep3()) return;
    setSubmitting(true);
    try {
      await submitVerification({
        full_name: fullName.trim(),
        phone: phone.trim(),
        licence_number: licenceNumber.trim(),
        vehicle_brand: vehicleBrand,
        vehicle_model: vehicleModel.trim(),
        vehicle_color: vehicleColor,
        vehicle_year: parseInt(vehicleYear),
        plate_number: plateNumber.trim(),
        selfie: selfie || "",
        licence_front: licenceFront || "",
        licence_back: licenceBack || "",
        car_photo: carPhoto || "",
        carte_grise: carteGrise || "",
      });
      if (Platform.OS === "web") window.alert("Verification submitted! Awaiting admin review.");
      else Alert.alert("Submitted", "Verification submitted! Awaiting admin review.");
      router.back();
    } catch (err: any) {
      alert(err.message || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  function ImageUpload({ label, value, onPick }: { label: string; value: string | null; onPick: () => void }) {
    return (
      <Pressable style={s.imgUpload} onPress={onPick}>
        {value ? (
          <Image source={{ uri: value }} style={s.imgPreview} />
        ) : (
          <View style={s.imgEmpty}>
            <Ionicons name="camera-outline" size={24} color={colors.textMuted} />
            <Text style={s.imgLabel}>{label}</Text>
          </View>
        )}
        {value && <View style={s.imgCheck}><Ionicons name="checkmark" size={14} color={colors.white} /></View>}
      </Pressable>
    );
  }

  function SelectGrid({ options, value, onSelect }: { options: string[]; value: string; onSelect: (v: string) => void }) {
    return (
      <View style={s.selectGrid}>
        {options.map((o) => (
          <Pressable key={o} style={[s.selectItem, value === o && s.selectItemActive]} onPress={() => onSelect(o)}>
            <Text style={[s.selectText, value === o && s.selectTextActive]}>{o}</Text>
          </Pressable>
        ))}
      </View>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      {/* Progress */}
      <View style={s.progressRow}>
        {[1, 2, 3].map((n) => (
          <View key={n} style={s.progressStep}>
            <View style={[s.progressDot, step >= n && s.progressDotActive]}>
              <Text style={[s.progressDotText, step >= n && { color: colors.white }]}>{n}</Text>
            </View>
            <Text style={[s.progressLabel, step === n && { color: colors.text, fontWeight: "700" }]}>
              {n === 1 ? "Personal" : n === 2 ? "Licence" : "Vehicle"}
            </Text>
          </View>
        ))}
      </View>

      <ScrollView style={s.scroll} keyboardShouldPersistTaps="handled">
        {/* Step 1: Personal Info */}
        {step === 1 && (
          <View style={s.stepContent}>
            <Text style={s.stepTitle}>Personal Information</Text>
            <Text style={s.stepDesc}>Enter your details as they appear on your ID</Text>

            <Text style={s.label}>Full Name *</Text>
            <TextInput style={s.input} value={fullName} onChangeText={setFullName} placeholder="As on your licence" placeholderTextColor={colors.textMuted} />

            <Text style={s.label}>Phone Number *</Text>
            <TextInput style={s.input} value={phone} onChangeText={setPhone} placeholder="0612345678" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" />

            <Text style={s.label}>Age *</Text>
            <TextInput style={s.input} value={age} onChangeText={setAge} placeholder="e.g. 28" placeholderTextColor={colors.textMuted} keyboardType="number-pad" />

            <Text style={s.label}>City</Text>
            <TextInput style={s.input} value={city} onChangeText={setCity} placeholder="e.g. Casablanca" placeholderTextColor={colors.textMuted} />

            <Pressable style={s.nextBtn} onPress={() => { if (validateStep1()) setStep(2); }}>
              <Text style={s.nextBtnText}>Next: Driving Licence</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.white} />
            </Pressable>
          </View>
        )}

        {/* Step 2: Licence */}
        {step === 2 && (
          <View style={s.stepContent}>
            <Text style={s.stepTitle}>Driving Licence</Text>
            <Text style={s.stepDesc}>Upload both sides of your driving licence</Text>

            <Text style={s.label}>Licence Number *</Text>
            <TextInput style={s.input} value={licenceNumber} onChangeText={setLicenceNumber} placeholder="e.g. AB-123456" placeholderTextColor={colors.textMuted} />

            <Text style={s.label}>Date Obtained</Text>
            <TextInput style={s.input} value={licenceDate} onChangeText={setLicenceDate} placeholder="e.g. 2020-01-15" placeholderTextColor={colors.textMuted} />

            <Text style={s.label}>Expiry Date *</Text>
            <TextInput style={s.input} value={licenceExpiry} onChangeText={setLicenceExpiry} placeholder="e.g. 2030-01-15" placeholderTextColor={colors.textMuted} />

            <Text style={s.label}>Photos *</Text>
            <View style={s.imgRow}>
              <ImageUpload label="Licence Front" value={licenceFront} onPick={() => pickImage(setLicenceFront)} />
              <ImageUpload label="Licence Back" value={licenceBack} onPick={() => pickImage(setLicenceBack)} />
            </View>

            <Text style={[s.label, { marginTop: spacing.md }]}>Selfie Photo *</Text>
            <View style={s.imgRow}>
              <ImageUpload label="Your Selfie" value={selfie} onPick={() => pickImage(setSelfie)} />
            </View>

            <View style={s.btnRow}>
              <Pressable style={s.backBtn} onPress={() => setStep(1)}>
                <Ionicons name="arrow-back" size={18} color={colors.text} />
                <Text style={s.backBtnText}>Back</Text>
              </Pressable>
              <Pressable style={s.nextBtn} onPress={() => { if (validateStep2()) setStep(3); }}>
                <Text style={s.nextBtnText}>Next: Vehicle</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.white} />
              </Pressable>
            </View>
          </View>
        )}

        {/* Step 3: Vehicle */}
        {step === 3 && (
          <View style={s.stepContent}>
            <Text style={s.stepTitle}>Vehicle Information</Text>
            <Text style={s.stepDesc}>Enter your vehicle details</Text>

            <Text style={s.label}>Brand *</Text>
            <SelectGrid options={CAR_BRANDS} value={vehicleBrand} onSelect={setVehicleBrand} />

            <Text style={s.label}>Model *</Text>
            <TextInput style={s.input} value={vehicleModel} onChangeText={setVehicleModel} placeholder="e.g. Logan, Clio, 208" placeholderTextColor={colors.textMuted} />

            <Text style={s.label}>Color *</Text>
            <SelectGrid options={COLORS} value={vehicleColor} onSelect={setVehicleColor} />

            <Text style={s.label}>Year *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
              {YEARS.map((y) => (
                <Pressable key={y} style={[s.yearChip, vehicleYear === String(y) && s.yearChipActive]} onPress={() => setVehicleYear(String(y))}>
                  <Text style={[s.yearText, vehicleYear === String(y) && s.yearTextActive]}>{y}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={s.label}>Plate Number *</Text>
            <TextInput style={s.input} value={plateNumber} onChangeText={setPlateNumber} placeholder="e.g. 12345-A-1" placeholderTextColor={colors.textMuted} />

            <Text style={s.label}>Photos *</Text>
            <View style={s.imgRow}>
              <ImageUpload label="Car Photo" value={carPhoto} onPick={() => pickImage(setCarPhoto)} />
              <ImageUpload label="Carte Grise" value={carteGrise} onPick={() => pickImage(setCarteGrise)} />
            </View>

            <View style={s.btnRow}>
              <Pressable style={s.backBtn} onPress={() => setStep(2)}>
                <Ionicons name="arrow-back" size={18} color={colors.text} />
                <Text style={s.backBtnText}>Back</Text>
              </Pressable>
              <Pressable style={[s.nextBtn, { backgroundColor: colors.success }]} onPress={handleSubmit} disabled={submitting}>
                {submitting ? <ActivityIndicator color={colors.white} /> : (
                  <><Ionicons name="shield-checkmark-outline" size={18} color={colors.white} /><Text style={s.nextBtnText}>Submit</Text></>
                )}
              </Pressable>
            </View>
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  progressRow: { flexDirection: "row", justifyContent: "center", gap: spacing.xl, paddingVertical: spacing.md, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  progressStep: { alignItems: "center", gap: 4 },
  progressDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, justifyContent: "center", alignItems: "center" },
  progressDotActive: { backgroundColor: colors.primary },
  progressDotText: { fontSize: 14, fontWeight: "700", color: colors.textMuted },
  progressLabel: { fontSize: 11, color: colors.textMuted },
  scroll: { flex: 1 },
  stepContent: { padding: spacing.lg },
  stepTitle: { fontSize: 22, fontWeight: "700", color: colors.text, marginBottom: spacing.xs },
  stepDesc: { fontSize: 14, color: colors.textSecondary, marginBottom: spacing.lg },
  label: { fontSize: 13, fontWeight: "600", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: spacing.xs, marginTop: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 16, color: colors.text, backgroundColor: colors.surface, marginBottom: spacing.xs },
  selectGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.sm },
  selectItem: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  selectItemActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  selectText: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  selectTextActive: { color: colors.white },
  yearChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.surface, marginRight: 6, borderWidth: 1, borderColor: colors.border },
  yearChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  yearText: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  yearTextActive: { color: colors.white },
  imgRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  imgUpload: { flex: 1, height: 120, borderWidth: 2, borderColor: colors.border, borderStyle: "dashed", borderRadius: radius.md, overflow: "hidden", position: "relative" },
  imgEmpty: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.xs },
  imgLabel: { fontSize: 12, color: colors.textMuted, textAlign: "center" },
  imgPreview: { width: "100%", height: "100%", resizeMode: "cover" },
  imgCheck: { position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.success, justifyContent: "center", alignItems: "center" },
  btnRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  backBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingVertical: 14, borderWidth: 2, borderColor: colors.border, borderRadius: radius.md },
  backBtnText: { fontSize: 15, fontWeight: "600", color: colors.text },
  nextBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingVertical: 14, backgroundColor: colors.primary, borderRadius: radius.md },
  nextBtnText: { fontSize: 15, fontWeight: "700", color: colors.white },
});
