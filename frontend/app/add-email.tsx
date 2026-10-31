// Paste an email (or fill it in): the backend reads the headers, body, promo codes,
// prices, dates and mail id exactly as written and files it to the inbox for review.
import { useMutation } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, useInvalidateAll } from "@/src/lib/api";
import { AppHeader, Card, Icon, PrimaryButton } from "@/src/components/ui";
import { FormScroll, TextField } from "@/src/components/form";
import { makeStyles, useTheme } from "@/src/theme";

export default function AddEmail() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const invalidate = useInvalidateAll();
  const [body, setBody] = useState("");
  const [to, setTo] = useState("");

  const save = useMutation({
    // Headers (From / To / Subject) are picked out of the pasted text by the server.
    mutationFn: () => api.ingestEmail({ body: body.trim(), to: to.trim() }),
    onSuccess: () => { invalidate(); router.replace("/(tabs)/inbox"); },
  });

  const paste = async () => {
    const t = await Clipboard.getStringAsync();
    if (t) setBody(t);
  };

  return (
    <View style={styles.container}>
      <AppHeader title="Paste email" back />
      <FormScroll>
        <Card style={styles.hint}>
          <Icon name="email-search-outline" size={20} color={colors.brandPrimary} />
          <Text style={styles.hintText}>
            Copy a receipt, trial or offer email (include From, To and Subject if you can). SubMind reads the exact price,
            dates, promo code and which mail id it was sent to. You then choose account or plan.
          </Text>
        </Card>
        <PrimaryButton title="Paste from clipboard" icon="content-paste" variant="secondary" onPress={paste} testID="email-paste" />
        <TextField label="Email text" value={body} onChangeText={setBody} placeholder="From: Netflix <info@…>&#10;To: you@gmail.com&#10;Subject: …" multiline testID="email-body" />
        <TextField label="Received on (mail id, if not in the text)" value={to} onChangeText={setTo} placeholder="you@gmail.com" keyboardType="email-address" testID="email-to" />
      </FormScroll>
      <KeyboardStickyView>
        <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
          <PrimaryButton title="Read this email" icon="brain" onPress={() => save.mutate()} loading={save.isPending} disabled={!body.trim()} testID="email-save" />
          {save.isError ? <Text style={[styles.hintText, { color: colors.error, marginTop: 6 }]}>Could not reach the server. Check Settings → Server.</Text> : null}
        </View>
      </KeyboardStickyView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  hint: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  hintText: { color: colors.onSurfaceSecondary, fontSize: 13, flex: 1, lineHeight: 18 },
  bar: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
}));
