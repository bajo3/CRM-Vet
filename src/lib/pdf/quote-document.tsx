import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { DateTime } from "luxon";
import type { QuoteWithDocumentData } from "../services/quotes";

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
  quoteTitle: {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 14,
  },
  table: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 4,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  colDescription: {
    flex: 1,
  },
  colAmount: {
    width: 90,
    textAlign: "right",
  },
  tableHeaderText: {
    fontSize: 9,
    fontWeight: 700,
    color: "#475569",
    textTransform: "uppercase",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 10,
    paddingRight: 8,
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: 700,
    marginRight: 12,
  },
  totalValue: {
    fontSize: 12,
    fontWeight: 700,
    color: "#0f766e",
  },
  notes: {
    marginTop: 18,
    fontSize: 9.5,
    color: "#475569",
    lineHeight: 1.4,
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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(value);
}

type QuoteItem = { description: string; amount: number };

export function QuoteDocument({ quote, timezone }: { quote: QuoteWithDocumentData; timezone: string }) {
  const items = (quote.items as unknown as QuoteItem[]) ?? [];
  const issuedAt = DateTime.fromJSDate(quote.createdAt).setZone(timezone).setLocale("es").toFormat("d 'de' LLLL 'de' yyyy");

  return (
    <Document title={`Presupuesto - ${quote.pet.name}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.clinicName}>{quote.clinic.name}</Text>
            {quote.clinic.phone && <Text style={styles.clinicPhone}>{quote.clinic.phone}</Text>}
          </View>
          <View>
            <Text style={styles.docTitle}>PRESUPUESTO</Text>
            <Text style={styles.docDate}>{issuedAt}</Text>
          </View>
        </View>

        <View style={[styles.section, styles.row]}>
          <View style={styles.infoBlock}>
            <Text style={styles.sectionTitle}>Mascota</Text>
            <Text style={styles.infoLine}>{quote.pet.name}</Text>
            <Text style={styles.infoLine}>{quote.pet.species}{quote.pet.breed ? ` · ${quote.pet.breed}` : ""}</Text>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.sectionTitle}>Tutor/a</Text>
            <Text style={styles.infoLine}>{quote.pet.client.name}</Text>
            <Text style={styles.infoLine}>{quote.pet.client.phone}</Text>
          </View>
        </View>

        {quote.title && <Text style={styles.quoteTitle}>{quote.title}</Text>}

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.colDescription, styles.tableHeaderText]}>Descripción</Text>
            <Text style={[styles.colAmount, styles.tableHeaderText]}>Monto</Text>
          </View>
          {items.map((item, index) => (
            <View key={index} style={[styles.tableRow, index === items.length - 1 ? styles.tableRowLast : {}]}>
              <Text style={styles.colDescription}>{item.description}</Text>
              <Text style={styles.colAmount}>{formatCurrency(item.amount)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatCurrency(Number(quote.total))}</Text>
        </View>

        {quote.notes && (
          <View style={styles.notes}>
            <Text style={styles.sectionTitle}>Notas</Text>
            <Text>{quote.notes}</Text>
          </View>
        )}

        <Text style={styles.footer}>
          Presupuesto generado por {quote.user.name} · {quote.clinic.name} · Validez sujeta a confirmación de la clínica.
        </Text>
      </Page>
    </Document>
  );
}
