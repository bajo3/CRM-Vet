import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { DateTime } from "luxon";
import type { PrescriptionWithDocumentData } from "../services/prescriptions";
import { COLORS, DocumentHeader, sharedStyles } from "./theme";

const styles = StyleSheet.create({
  rxSymbol: {
    fontSize: 30,
    fontWeight: 700,
    color: COLORS.primary,
    marginBottom: -6,
  },
  contentBox: {
    marginTop: 4,
    backgroundColor: "#f8fafc",
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
    padding: 16,
    minHeight: 180,
  },
  contentText: {
    fontSize: 11,
    lineHeight: 1.7,
  },
  signatureBlock: {
    marginTop: 46,
    alignItems: "flex-end",
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
        <DocumentHeader clinicName={prescription.clinic.name} clinicPhone={prescription.clinic.phone} logoUrl={prescription.clinic.logoUrl} docLabel="RECETA" dateLabel={issuedAt} />

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

          <Text style={styles.rxSymbol}>℞</Text>
          <Text style={sharedStyles.sectionTitle}>Indicación</Text>
          <View style={styles.contentBox}>
            <Text style={styles.contentText}>{prescription.content}</Text>
          </View>

          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureName}>{prescription.user.name}</Text>
              <Text style={styles.signatureRole}>Médico/a veterinario/a</Text>
              {prescription.user.licenseNumber && <Text style={styles.signatureLicense}>Matrícula: {prescription.user.licenseNumber}</Text>}
            </View>
          </View>
        </View>

        <Text style={sharedStyles.footer} fixed>
          Receta emitida por {prescription.user.name} · {prescription.clinic.name}
        </Text>
      </Page>
    </Document>
  );
}
