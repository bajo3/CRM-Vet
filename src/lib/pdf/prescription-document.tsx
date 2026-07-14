import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { DateTime } from "luxon";
import type { PrescriptionWithDocumentData } from "../services/prescriptions";

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 50,
    paddingHorizontal: 42,
    fontSize: 10.5,
    fontFamily: "Helvetica",
    color: "#1e293b",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 1.5,
    borderBottomColor: "#0f766e",
    paddingBottom: 12,
    marginBottom: 20,
  },
  clinicName: {
    fontSize: 16,
    fontWeight: 700,
    color: "#0f766e",
  },
  clinicPhone: {
    marginTop: 2,
    fontSize: 9.5,
    color: "#64748b",
  },
  docTitle: {
    fontSize: 13,
    fontWeight: 700,
    textAlign: "right",
  },
  docDate: {
    marginTop: 2,
    fontSize: 9.5,
    color: "#64748b",
    textAlign: "right",
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: 700,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  infoBlock: {
    width: "48%",
  },
  infoLine: {
    marginBottom: 2,
  },
  contentBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 4,
    padding: 14,
    minHeight: 160,
  },
  contentText: {
    fontSize: 11,
    lineHeight: 1.6,
  },
  signatureBlock: {
    marginTop: 40,
    alignItems: "flex-end",
  },
  signatureLine: {
    width: 220,
    borderTopWidth: 1,
    borderTopColor: "#94a3b8",
    paddingTop: 6,
    textAlign: "center",
  },
  signatureName: {
    fontSize: 10,
    fontWeight: 700,
  },
  signatureLicense: {
    fontSize: 9,
    color: "#64748b",
    marginTop: 1,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 42,
    right: 42,
    textAlign: "center",
    fontSize: 8,
    color: "#94a3b8",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 8,
  },
});

export function PrescriptionDocument({ prescription, timezone }: { prescription: PrescriptionWithDocumentData; timezone: string }) {
  const issuedAt = DateTime.fromJSDate(prescription.createdAt).setZone(timezone).setLocale("es").toFormat("d 'de' LLLL 'de' yyyy");

  return (
    <Document title={`Receta - ${prescription.pet.name}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.clinicName}>{prescription.clinic.name}</Text>
            {prescription.clinic.phone && <Text style={styles.clinicPhone}>{prescription.clinic.phone}</Text>}
          </View>
          <View>
            <Text style={styles.docTitle}>RECETA</Text>
            <Text style={styles.docDate}>{issuedAt}</Text>
          </View>
        </View>

        <View style={[styles.section, styles.row]}>
          <View style={styles.infoBlock}>
            <Text style={styles.sectionTitle}>Mascota</Text>
            <Text style={styles.infoLine}>{prescription.pet.name}</Text>
            <Text style={styles.infoLine}>{prescription.pet.species}{prescription.pet.breed ? ` · ${prescription.pet.breed}` : ""}</Text>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.sectionTitle}>Tutor/a</Text>
            <Text style={styles.infoLine}>{prescription.pet.client.name}</Text>
            <Text style={styles.infoLine}>{prescription.pet.client.phone}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Indicación</Text>
        <View style={styles.contentBox}>
          <Text style={styles.contentText}>{prescription.content}</Text>
        </View>

        <View style={styles.signatureBlock}>
          <View style={styles.signatureLine}>
            <Text style={styles.signatureName}>{prescription.user.name}</Text>
            {prescription.user.licenseNumber && <Text style={styles.signatureLicense}>Matrícula: {prescription.user.licenseNumber}</Text>}
          </View>
        </View>

        <Text style={styles.footer}>
          Receta emitida por {prescription.user.name} · {prescription.clinic.name}
        </Text>
      </Page>
    </Document>
  );
}
