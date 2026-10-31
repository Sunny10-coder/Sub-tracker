import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, useInvalidateAll } from "@/src/lib/api";
import { AppHeader, PrimaryButton } from "@/src/components/ui";
import { FormScroll, TextField } from "@/src/components/form";
import { makeStyles } from "@/src/theme";

export default function AddAccount() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const invalidate = useInvalidateAll();
  const [provider, setProvider] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loginUrl, setLoginUrl] = useState("");
  const [notes, setNotes] = useState("");
  const save = useMutation({
    mutationFn: () => api.createAccount({ provider: provider.trim(), email: email.trim(), display_name: displayName.trim(), login_url: loginUrl.trim(), notes: notes.trim() }),
    onSuccess: () => { invalidate(); router.replace("/accounts"); },
    onError: (e: Error) => Alert.alert("Unable to save account", e.message.includes("409") ? "This email already has an account for this service." : e.message),
  });
  return <View style={styles.container}>
    <AppHeader title="Add account" subtitle="No passwords or recovery codes" back />
    <FormScroll>
      <Text style={styles.hint}>Add one service and the email used to sign in. Your subscription can link to this account later.</Text>
      <TextField label="Service / provider" value={provider} onChangeText={setProvider} placeholder="e.g. Adobe, GitHub, Netflix" />
      <TextField label="Sign-in email" value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" />
      <TextField label="Account nickname (optional)" value={displayName} onChangeText={setDisplayName} placeholder="Personal / Work / Student" />
      <TextField label="Login URL (optional)" value={loginUrl} onChangeText={setLoginUrl} placeholder="https://..." />
      <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="Benefits, discounts, recovery hints without secrets" multiline />
    </FormScroll>
    <KeyboardStickyView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <PrimaryButton title="Save account" icon="check" loading={save.isPending}
          disabled={!provider.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())}
          onPress={() => save.mutate()} />
      </View>
    </KeyboardStickyView>
  </View>;
}
const useStyles = makeStyles(c => ({
  container: { flex: 1, backgroundColor: c.surface },
  hint: { color: c.onSurfaceTertiary, fontSize: 14, lineHeight: 21 },
  footer: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border },
}));