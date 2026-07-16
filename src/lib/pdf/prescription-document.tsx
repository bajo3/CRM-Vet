import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { DateTime } from "luxon";
import type { PrescriptionWithDocumentData } from "../services/prescriptions";
import { COLORS, DocumentFooter, DocumentHeader, sharedStyles } from "./theme";

const styles = StyleSheet.create({
  rxSymbol: {
    fontSize: 26,
    fontWeight: 700,
    color: COLORS.primary,
    marginBottom: -4,
  },
  contentBox: {
    marginTop: 4,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
    padding: 16,
    minHeight: 190,
  },
  contentText: {
    fontSize: 11,
    lineHeight: 1.7,
  },
  signatureBlock: {
    marginTop: 46,
    alignItems: "flex-end",
  },
  prescriptionHeading: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  prescriptionLabel: {
    fontSize: 8.5,
    fontWeight: 700,
    color: COLORS.primaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    paddingBottom: 3,
  },
  safetyNote: {
    marginTop: 14,
    borderRadius: 8,
    backgroundColor: COLORS.primaryTint,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 8.5,
    color: COLORS.primaryDark,
    lineHeight: 1.35,
  },
  signatureLine: {
    width: 230,
    borderTopWidth: 1,
    borderTopColor: "#94a3b8",
    paddingTop: 6,
    textAlign: "center",
  },
  signatureName: {
    fontSize: 10.5,
    fontWeight: 700,
    color: COLORS.ink,
  },
  signatureRole: {
    fontSize: 8.5,
    color: COLORS.muted,
    marginTop: 1,
  },
  signatureLicense: {
    fontSize: 9,
    color: COLORS.muted,
    marginTop: 1,
  },
});

export function PrescriptionDocument({ prescription, timezone }: { prescription: PrescriptionWithDocumentData; timezone: string }) {
  const issuedAt = DateTime.fromJSDate(prescription.createdAt).setZone(timezone).setLocale("es").toFormat("d 'de' LLLL 'de' yyyy");

  return (
    <Document title={`Receta - ${prescription.pet.name}`}>
      <Page size="A4" style={sharedStyles.page}>
        <View style={sharedStyles.spine} fixed />
        <DocumentHeader clinicName={prescription.clinic.name} clinicPhone={prescription.clinic.phone} logoUrl={prescription.clinic.logoUrl} docLabel="RECETA" dateLabel={issuedAt} documentId={prescription.id.slice(-8).toUpperCase()} />

        <View style={sharedStyles.body}>
          <View style={[sharedStyles.section, sharedStyles.row]}>
            <View style={sharedStyles.infoCard}>
              <Text style={sharedStyles.sectionTitle}>Mascota</Text>
              <Text style={sharedStyles.infoName}>{prescription.pet.name}</Text>
              <Text style={sharedStyles.infoLine}>{prescription.pet.species}{prescription.pet.breed ? ` · ${prescription.pet.breed}` : ""}</Text>
            </View>
            <View style={sharedStyles.infoCard}>
              <Text style={sharedStyles.sectionTitle}>Tutor/a</Text>
              <Text style={sharedStyles.infoName}>{prescription.pet.client.name}</Text>
              <Text style={sharedStyles.infoLine}>{prescription.pet.client.phone}</Text>
            </View>
          </View>

          <View style={styles.prescriptionHeading}><Text style={styles.rxSymbol}>Rp. /</Text><Text style={styles.prescriptionLabel}>Indicación veterinaria</Text></View>
          <View style={styles.contentBox}>
            <Text style={styles.contentText}>{prescription.content}</Text>
          </View>
          <Text style={styles.safetyNote}>Administrar únicamente según esta indicación. Ante una reacción inesperada o dudas con la medicación, comunicarse con la clínica.</Text>

          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureName}>{prescription.user.name}</Text>
              <Text style={styles.signatureRole}>Médico/a veterinario/a</Text>
              {prescription.user.licenseNumber && <Text style={styles.signatureLicense}>Matrícula: {prescription.user.licenseNumber}</Text>}
            </View>
          </View>
        </View>

        <DocumentFooter text={`Receta emitida por ${prescription.user.name} · ${prescription.clinic.name}`} />
      </Page>
    </Document>
  );
}
