import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";

import { api, useInvalidateAll } from "@/src/lib/api";
import { AppHeader, Card, Icon, PrimaryButton } from "@/src/components/ui";
import { FormScroll, SelectField, TextField } from "@/src/components/form";
import { makeStyles, useTheme } from "@/src/theme";

const SOURCES = ["Website", "Instagram", "YouTube", "Reddit", "Chrome", "Other"];

export default function PasteLink() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const invalidate = useInvalidateAll();
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [source, setSource] = useState("Website");

  const save = useMutation({
    mutationFn: () => api.ingestLink(url.trim(), source, note),
    onSuccess: (res) => { invalidate(); router.replace(res?.inbox ? "/(tabs)/inbox" : "/link-vault"); },
  });

  const paste = async () => {
    const t = await Clipboard.getStringAsync();
    if (t) setUrl(t);
  };

  return (
    <View style={styles.container}>
      <AppHeader title="Paste a link" back />
      <FormScroll>
        <Card style={styles.hint}>
          <Icon name="information-outline" size={18} color={colors.brandPrimary} />
          <Text style={styles.hintText}>We save the link instantly, then AI adds a summary, tags and category.</Text>
        </Card>
        <TextField label="URL" value={url} onChangeText={setUrl} placeholder="https://…" testID="link-url" />
        <PrimaryButton title="Paste from clipboard" icon="content-paste" variant="secondary" onPress={paste} testID="link-paste" />
        <SelectField label="Source" options={SOURCES} value={source} onChange={setSource} testID="link-source" />
        <TextField label="Note (optional)" value={note} onChangeText={setNote} placeholder="Why are you saving this?" multiline testID="link-note" />
      </FormScroll>
      <KeyboardStickyView>
        <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
          <PrimaryButton title="Save link" icon="link-variant" onPress={() => save.mutate()} loading={save.isPending} disabled={!url.trim()} testID="link-save" />
        </View>
      </KeyboardStickyView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  hint: { flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: colors.brandPrimary + "12", borderColor: colors.brandPrimary + "22" },
  hintText: { color: colors.onSurfaceSecondary, fontSize: 13, flex: 1, lineHeight: 18 },
  bar: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
}));
