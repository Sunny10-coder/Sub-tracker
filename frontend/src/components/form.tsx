import { ReactNode } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Chip } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

export function FormScroll({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAwareScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 140, gap: 16 }}
      showsVerticalScrollIndicator={false}
      bottomOffset={20}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}

export function TextField({ label, value, onChangeText, placeholder, keyboardType, multiline, testID }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        testID={testID}
        style={[styles.input, multiline && { height: 96, textAlignVertical: "top" }]}
        value={value === null || value === undefined ? "" : String(value)}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboardType}
        multiline={multiline}
      />
    </View>
  );
}

export function SelectField({ label, options, value, onChange, testID }: any) {
  const styles = useStyles();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optRow}>
        {options.map((o: string) => (
          <Chip key={o} label={o} active={value === o} onPress={() => onChange(o)} testID={`${testID}-${o}`} />
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  field: { gap: 8 },
  label: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: "800", marginLeft: 4 },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.onSurface,
  },
  optRow: { gap: 8, paddingVertical: 2 },
}));
