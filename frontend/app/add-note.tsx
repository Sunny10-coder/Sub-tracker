import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, useInvalidateAll } from "@/src/lib/api";
import { AppHeader, Card, Icon, PrimaryButton } from "@/src/components/ui";
import { FormScroll, TextField } from "@/src/components/form";
import { makeStyles, useTheme } from "@/src/theme";

export default function AddNote() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const invalidate = useInvalidateAll();
  const [text, setText] = useState("");

  const save = useMutation({
    mutationFn: () => api.ingestText(text.trim(), "note"),
    onSuccess: () => { invalidate(); router.replace("/(tabs)/inbox"); },
  });

  return (
    <View style={styles.container}>
      <AppHeader title="Add a note" back />
      <FormScroll>
        <Card style={styles.hint}>
          <Icon name="auto-fix" size={18} color={colors.brandSecondary} />
          <Text style={styles.hintText}>Paste any subscription info, price, or offer. AI will understand and file it for you.</Text>
        </Card>
        <TextField label="Note" value={text} onChangeText={setText} placeholder="e.g. Notion Plus AED 40/mo, renews Nov 3…" multiline testID="note-text" />
      </FormScroll>
      <KeyboardStickyView>
        <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
          <PrimaryButton title="Process with AI" icon="brain" onPress={() => save.mutate()} loading={save.isPending} disabled={!text.trim()} testID="note-save" />
        </View>
      </KeyboardStickyView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  hint: { flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: colors.brandSecondary + "12", borderColor: colors.brandSecondary + "22" },
  hintText: { color: colors.onSurfaceSecondary, fontSize: 13, flex: 1, lineHeight: 18 },
  bar: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
}));
