import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { DateTime } from "luxon";
import type { QuoteWithDocumentData } from "../services/quotes";
import { COLORS, DocumentFooter, DocumentHeader, sharedStyles } from "./theme";

const styles = StyleSheet.create({
  quoteTitle: {
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 5,
    color: COLORS.ink,
  },
  quoteLead: {
    marginBottom: 16,
    fontSize: 9,
    color: COLORS.muted,
    lineHeight: 1.4,
  },
  table: {
    borderRadius: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: COLORS.primary,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  tableRowAlt: {
    backgroundColor: "#f8fafc",
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  colDescription: {
    flex: 1,
  },
  colNumber: {
    width: 28,
    color: COLORS.muted,
  },
  colAmount: {
    width: 92,
    textAlign: "right",
  },
  tableHeaderText: {
    fontSize: 9,
    fontWeight: 700,
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  totalBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  totalLabel: {
    fontSize: 10.5,
    fontWeight: 700,
    color: "#ffffff",
  },
  totalValue: {
    fontSize: 15,
    fontWeight: 700,
    color: "#ffffff",
  },
  notes: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    padding: 12,
    fontSize: 9.5,
    color: "#475569",
    lineHeight: 1.4,
  },
  validity: {
    marginTop: 14,
    fontSize: 8.5,
    color: COLORS.muted,
    fontStyle: "italic",
  },
});

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(value);
}

type QuoteItem = { description: string; amount: number };

export function QuoteDocument({ quote, timezone }: { quote: QuoteWithDocumentData; timezone: string }) {
  const items = (quote.items as unknown as QuoteItem[]) ?? [];
  const issuedAt = DateTime.fromJSDate(quote.createdAt).setZone(timezone).setLocale("es").toFormat("d 'de' LLLL 'de' yyyy");

  return (
    <Document title={`Presupuesto - ${quote.pet.name}`}>
      <Page size="A4" style={sharedStyles.page}>
        <View style={sharedStyles.spine} fixed />
        <DocumentHeader clinicName={quote.clinic.name} clinicPhone={quote.clinic.phone} logoUrl={quote.clinic.logoUrl} docLabel="PRESUPUESTO" dateLabel={issuedAt} documentId={quote.id.slice(-8).toUpperCase()} />

        <View style={sharedStyles.body}>
          <View style={[sharedStyles.section, sharedStyles.row]}>
            <View style={sharedStyles.infoCard}>
              <Text style={sharedStyles.sectionTitle}>Mascota</Text>
              <Text style={sharedStyles.infoName}>{quote.pet.name}</Text>
              <Text style={sharedStyles.infoLine}>{quote.pet.species}{quote.pet.breed ? ` · ${quote.pet.breed}` : ""}</Text>
            </View>
            <View style={sharedStyles.infoCard}>
              <Text style={sharedStyles.sectionTitle}>Tutor/a</Text>
              <Text style={sharedStyles.infoName}>{quote.pet.client.name}</Text>
              <Text style={sharedStyles.infoLine}>{quote.pet.client.phone}</Text>
            </View>
          </View>

          <Text style={styles.quoteTitle}>{quote.title || `Propuesta de atención para ${quote.pet.name}`}</Text>
          <Text style={styles.quoteLead}>Detalle de prestaciones y valores estimados para la atención veterinaria.</Text>

          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.colNumber, styles.tableHeaderText]}>#</Text>
              <Text style={[styles.colDescription, styles.tableHeaderText]}>Descripción</Text>
              <Text style={[styles.colAmount, styles.tableHeaderText]}>Monto</Text>
            </View>
            {items.map((item, index) => (
              <View
                key={index}
                style={[styles.tableRow, index % 2 === 1 ? styles.tableRowAlt : {}, index === items.length - 1 ? styles.tableRowLast : {}]}
              >
                <Text style={styles.colNumber}>{String(index + 1).padStart(2, "0")}</Text>
                <Text style={styles.colDescription}>{item.description}</Text>
                <Text style={styles.colAmount}>{formatCurrency(item.amount)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.totalBar}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatCurrency(Number(quote.total))}</Text>
          </View>

          {quote.notes && (
            <View style={styles.notes}>
              <Text style={sharedStyles.sectionTitle}>Notas</Text>
              <Text>{quote.notes}</Text>
            </View>
          )}

          <Text style={styles.validity}>Este presupuesto es informativo y está sujeto a confirmación de la clínica. Los valores pueden variar si cambia el diagnóstico, la complejidad o la disponibilidad al momento de la atención.</Text>
        </View>

        <DocumentFooter text={`Presupuesto generado por ${quote.user.name} · ${quote.clinic.name}`} />
      </Page>
    </Document>
  );
}
