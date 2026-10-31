import { useMutation } from "@tanstack/react-query";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { useEffect, useRef, useState } from "react";
import * as Clipboard from "expo-clipboard";
import { ActivityIndicator, FlatList, Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/lib/api";
import { AppHeader, Icon } from "@/src/components/ui";
import { font, makeStyles, useTheme } from "@/src/theme";
import { TAB_BAR_SPACE } from "./_layout";

const SUGGESTIONS = [
  "When do I need to cancel what?",
  "Which mail id is each subscription on?",
  "Where do I cancel Netflix?",
  "Do I have any promo codes?",
  "What renews this month?",
  "How much do I spend every month?",
  "Which trials expire soon?",
  "Show my saved GitHub repos",
  "What links did I save but never open?",
];

type Msg = { role: "user" | "ai"; text: string; pending?: boolean };

export default function AskAI() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const listRef = useRef<FlatList>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  useEffect(() => {
    api.chatHistory().then((h) => {
      const msgs: Msg[] = [];
      h.forEach((row: any) => { msgs.push({ role: "user", text: row.question }); msgs.push({ role: "ai", text: row.answer }); });
      setMessages(msgs);
    }).catch(() => {});
  }, []);

  const chat = useMutation({
    mutationFn: (q: string) => api.chat(q),
    onMutate: (q) => {
      setMessages((m) => [...m, { role: "user", text: q }, { role: "ai", text: "", pending: true }]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    },
    onSuccess: (res) => {
      setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: "ai", text: res.answer }; return c; });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    },
    onError: () => {
      setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: "ai", text: "Sorry, I couldn't answer that. Please try again." }; return c; });
    },
  });

  const send = (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || chat.isPending) return;
    setInput("");
    chat.mutate(q);
  };

  const copyMsg = async (text: string, idx: number) => {
    await Clipboard.setStringAsync(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx((c) => (c === idx ? null : c)), 1500);
  };

  const startRecording = async () => {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) {
        setMessages((m) => [...m, { role: "ai", text: "Microphone access is off. Open Settings to enable voice input." }]);
        Linking.openSettings();
      }
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecording(true);
  };

  const stopRecording = async () => {
    setRecording(false);
    await recorder.stop();
    const uri = recorder.uri;
    if (!uri) return;
    setTranscribing(true);
    try {
      const res = await api.transcribe(uri);
      if (res.text) setInput((prev) => (prev ? prev + " " : "") + res.text);
    } catch {
      // ignore
    } finally {
      setTranscribing(false);
    }
  };

  return (
    <View style={styles.container}>
      <AppHeader title="Ask AI" subtitle="Your memory for subscriptions, promos and links" />
      <KeyboardAvoidingView behavior="translate-with-padding" style={{ flex: 1 }} keyboardVerticalOffset={0}>
        {messages.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.aiOrb}><Icon name="robot-happy" size={44} color={colors.onAccent} /></View>
            <Text style={styles.emptyTitle}>ask me anything</Text>
            <Text style={styles.emptySub}>I answer from your subscriptions, mail ids, promo codes, saved links and reminders. Tap a question or type your own.</Text>
            <View style={styles.suggestions}>
              {SUGGESTIONS.slice(0, 6).map((q) => (
                <Pressable key={q} style={styles.suggestion} testID={`suggest-${q}`} onPress={() => send(q)} accessibilityRole="button">
                  <Text style={styles.suggestionText}>{q}</Text>
                  <Icon name="arrow-right" size={18} color={colors.accentPink} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item, index }) => (
              <View style={[styles.bubble, item.role === "user" ? styles.userBubble : styles.aiBubble]}>
                {item.pending ? (
                  <ActivityIndicator color={colors.brandPrimary} />
                ) : (
                  <>
                    {/* selectable: long-press to select and copy any part of an answer */}
                    <Text selectable style={[styles.bubbleText, { color: item.role === "user" ? colors.onBrandPrimary : colors.onSurfaceSecondary }]}>{item.text}</Text>
                    {item.role === "ai" && item.text ? (
                      <Pressable onPress={() => copyMsg(item.text, index)} hitSlop={10} style={styles.copyBtn} accessibilityRole="button" accessibilityLabel="Copy answer">
                        <Icon name={copiedIdx === index ? "check" : "content-copy"} size={15} color={colors.muted} />
                        <Text style={styles.copyText}>{copiedIdx === index ? "Copied" : "Copy"}</Text>
                      </Pressable>
                    ) : null}
                  </>
                )}
              </View>
            )}
          />
        )}

        {messages.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickRow} contentContainerStyle={styles.quickContent} keyboardShouldPersistTaps="handled">
            {SUGGESTIONS.map((q) => (
              <Pressable key={q} style={styles.quickChip} onPress={() => send(q)} accessibilityRole="button" disabled={chat.isPending}>
                <Text style={styles.quickText}>{q}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <View style={[styles.inputBar, { paddingBottom: insets.bottom + TAB_BAR_SPACE - 6 }]}>
          <View style={styles.inputWrap}>
            <TextInput
              testID="ai-input"
              style={styles.input}
              placeholder={transcribing ? "Transcribing…" : "Ask: when do I cancel…?"}
              placeholderTextColor={colors.muted}
              value={input}
              onChangeText={setInput}
              multiline
              onSubmitEditing={() => send()}
            />
            <Pressable testID="ai-mic" onPress={recording ? stopRecording : startRecording} style={[styles.micBtn, recording && { backgroundColor: colors.error }]}>
              {transcribing ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Icon name={recording ? "stop" : "microphone"} size={20} color={recording ? colors.onError : colors.brandPrimary} />}
            </Pressable>
          </View>
          <Pressable testID="ai-send" onPress={() => send()} disabled={!input.trim() || chat.isPending} style={[styles.sendBtn, { opacity: !input.trim() || chat.isPending ? 0.5 : 1 }]}>
            <Icon name="send" size={20} color={colors.onAccent} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 10 },
  aiOrb: { width: 92, height: 92, backgroundColor: colors.accentPink, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  emptyTitle: { ...font.light, color: colors.onSurface, fontSize: 32 },
  emptySub: { color: colors.muted, fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 8 },
  suggestions: { gap: 6, width: "100%", marginTop: 8 },
  suggestion: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, backgroundColor: colors.surfaceSecondary, paddingHorizontal: 14, paddingVertical: 14, minHeight: 48 },
  suggestionText: { color: colors.onSurfaceSecondary, fontSize: 15, fontWeight: "500", flex: 1 },
  bubble: { maxWidth: "88%", paddingHorizontal: 14, paddingVertical: 11 },
  userBubble: { alignSelf: "flex-end", backgroundColor: colors.brandPrimary },
  aiBubble: { alignSelf: "flex-start", backgroundColor: colors.surfaceSecondary },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", marginTop: 8, minHeight: 28 },
  copyText: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  quickRow: { flexGrow: 0, borderTopWidth: 1, borderTopColor: colors.border },
  quickContent: { gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  quickChip: { backgroundColor: colors.surfaceSecondary, paddingHorizontal: 12, minHeight: 36, justifyContent: "center" },
  quickText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "500" },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 12, paddingTop: 8, backgroundColor: colors.surface },
  inputWrap: { flex: 1, flexDirection: "row", alignItems: "flex-end", backgroundColor: colors.surfaceSecondary, paddingLeft: 14, paddingRight: 4, paddingVertical: 4, minHeight: 48 },
  input: { flex: 1, color: colors.onSurface, fontSize: 16, maxHeight: 120, paddingVertical: 8 },
  micBtn: { width: 42, height: 42, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  sendBtn: { width: 48, height: 48, backgroundColor: colors.accentPink, alignItems: "center", justifyContent: "center" },
}));
