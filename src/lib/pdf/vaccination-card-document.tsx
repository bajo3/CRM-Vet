import { formatPhone } from "../phone";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { DateTime } from "luxon";
import type { VaccinationCard } from "../queries/vaccination-card";
import { COLORS, DocumentFooter, DocumentHeader, sharedStyles } from "./theme";

const styles = StyleSheet.create({
  tableHeader: {
    flexDirection: "row",
    backgroundColor: COLORS.headerTint,
    borderRadius: 6,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  headerCell: {
    fontSize: 8,
    fontWeight: 700,
    color: COLORS.primaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  colDate: { width: "17%" },
  colVaccine: { width: "38%", paddingRight: 8 },
  colVet: { width: "27%", paddingRight: 8 },
  colNext: { width: "18%" },
  vaccineName: { fontSize: 10.5, fontWeight: 700 },
  detail: { marginTop: 2, fontSize: 8.5, color: COLORS.muted },
  empty: {
    marginTop: 6,
    padding: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    textAlign: "center",
    color: COLORS.muted,
  },
});

export function VaccinationCardDocument({ card }: { card: VaccinationCard }) {
  const timezone = card.clinic.timezone;
  const formatDate = (date: Date) => DateTime.fromJSDate(date).setZone(timezone).toFormat("dd/MM/yyyy");
  const issuedAt = DateTime.now().setZone(timezone).setLocale("es").toFormat("d 'de' LLLL 'de' yyyy");
  const petLine = [card.species, card.breed, card.sex].filter(Boolean).join(" · ");

  return (
    <Document title={`Libreta de vacunación - ${card.name}`}>
      <Page size="A4" style={sharedStyles.page}>
        <View style={sharedStyles.spine} fixed />
        <DocumentHeader clinicName={card.clinic.name} clinicPhone={card.clinic.phone ? formatPhone(card.clinic.phone) : null} logoUrl={card.clinic.logoUrl} docLabel="VACUNACIÓN" dateLabel={issuedAt} documentId={card.id.slice(-8).toUpperCase()} />

        <View style={sharedStyles.body}>
          <View style={[sharedStyles.section, sharedStyles.row]}>
            <View style={sharedStyles.infoCard}>
              <Text style={sharedStyles.sectionTitle}>Mascota</Text>
              <Text style={sharedStyles.infoName}>{card.name}</Text>
              <Text style={sharedStyles.infoLine}>{petLine}</Text>
              {card.birthDate && <Text style={sharedStyles.infoLine}>Nacimiento: {formatDate(card.birthDate)}</Text>}
            </View>
            <View style={sharedStyles.infoCard}>
              <Text style={sharedStyles.sectionTitle}>Tutor/a</Text>
              <Text style={sharedStyles.infoName}>{card.client.name}</Text>
              <Text style={sharedStyles.infoLine}>{formatPhone(card.client.phone)}</Text>
            </View>
          </View>

          <Text style={sharedStyles.sectionTitle}>Vacunas aplicadas</Text>
          {card.medicalRecords.length === 0 ? (
            <Text style={styles.empty}>Todavía no hay vacunas registradas para {card.name}.</Text>
          ) : (
            <View>
              <View style={styles.tableHeader} fixed>
                <Text style={[styles.headerCell, styles.colDate]}>Fecha</Text>
                <Text style={[styles.headerCell, styles.colVaccine]}>Vacuna</Text>
                <Text style={[styles.headerCell, styles.colVet]}>Profesional</Text>
                <Text style={[styles.headerCell, styles.colNext]}>Próxima dosis</Text>
              </View>
              {card.medicalRecords.map((record) => (
                <View key={record.id} style={styles.row} wrap={false}>
                  <Text style={styles.colDate}>{formatDate(record.createdAt)}</Text>
                  <View style={styles.colVaccine}>
                    <Text style={styles.vaccineName}>{record.reason}</Text>
                    {record.treatment && <Text style={styles.detail}>{record.treatment}</Text>}
                  </View>
                  <View style={styles.colVet}>
                    <Text>{record.user.name}</Text>
                    {record.user.licenseNumber && <Text style={styles.detail}>Mat. {record.user.licenseNumber}</Text>}
                  </View>
                  <Text style={styles.colNext}>{record.nextDueDate ? formatDate(record.nextDueDate) : "—"}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <DocumentFooter text={`Libreta de vacunación de ${card.name} · ${card.clinic.name}`} />
      </Page>
    </Document>
  );
}
