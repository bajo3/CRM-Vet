import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";

export const COLORS = {
  primary: "#0f766e",
  primaryDark: "#0b5c56",
  primaryTint: "#ecfdf5",
  ink: "#1e293b",
  muted: "#64748b",
  border: "#e2e8f0",
  headerTint: "#f0fdfa",
};

export const sharedStyles = StyleSheet.create({
  page: {
    paddingTop: 0,
    paddingBottom: 56,
    paddingHorizontal: 0,
    fontSize: 10.5,
    fontFamily: "Helvetica",
    color: COLORS.ink,
  },
  spine: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: 7,
    backgroundColor: COLORS.primary,
  },
  body: {
    paddingHorizontal: 42,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.headerTint,
    paddingVertical: 20,
    paddingHorizontal: 42,
    marginBottom: 24,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logo: {
    width: 42,
    height: 42,
    borderRadius: 8,
    objectFit: "contain",
  },
  clinicName: {
    fontSize: 15,
    fontWeight: 700,
    color: COLORS.primaryDark,
  },
  clinicPhone: {
    marginTop: 2,
    fontSize: 9,
    color: COLORS.muted,
  },
  badge: {
    backgroundColor: COLORS.primary,
    borderRadius: 3,
    paddingVertical: 5,
    paddingHorizontal: 12,
    alignSelf: "flex-end",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: 700,
    color: "#ffffff",
    letterSpacing: 0.5,
  },
  docDate: {
    marginTop: 5,
    fontSize: 9,
    color: COLORS.muted,
    textAlign: "right",
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 8.5,
    fontWeight: 700,
    color: COLORS.primaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 5,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  infoCard: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderRadius: 6,
    padding: 12,
  },
  infoLine: {
    marginBottom: 2,
    fontSize: 10,
  },
  infoName: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 3,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 42,
    right: 42,
    textAlign: "center",
    fontSize: 8,
    color: COLORS.muted,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
  },
});

export function DocumentHeader({
  clinicName,
  clinicPhone,
  logoUrl,
  docLabel,
  dateLabel,
}: {
  clinicName: string;
  clinicPhone?: string | null;
  logoUrl?: string | null;
  docLabel: string;
  dateLabel: string;
}) {
  return (
    <View style={sharedStyles.header} fixed>
      <View style={sharedStyles.headerLeft}>
        {logoUrl && <Image src={logoUrl} style={sharedStyles.logo} />}
        <View>
          <Text style={sharedStyles.clinicName}>{clinicName}</Text>
          {clinicPhone && <Text style={sharedStyles.clinicPhone}>{clinicPhone}</Text>}
        </View>
      </View>
      <View>
        <View style={sharedStyles.badge}>
          <Text style={sharedStyles.badgeText}>{docLabel}</Text>
        </View>
        <Text style={sharedStyles.docDate}>{dateLabel}</Text>
      </View>
    </View>
  );
}
