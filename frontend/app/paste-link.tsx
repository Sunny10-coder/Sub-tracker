// Paste a link: it is identified (GitHub repo, Instagram reel, YouTube, web page...), analysed,
// tagged and saved like a bookmark. Optional tags and a "remind me" so it is never forgotten.
import { useMutation } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, useInvalidateAll } from "@/src/lib/api";
import { KIND_ICON, KIND_LABEL, REMIND_PRESETS, detectLinkKind, looksLikeUrl, extractSharedUrl, parseTags } from "@/src/lib/format";
import { AppHeader, Card, ChipRow, Icon, PrimaryButton } from "@/src/components/ui";
import { FormScroll, TextField } from "@/src/components/form";
import { font, makeStyles, useTheme } from "@/src/theme";

const KIND_HINT: Record<string, string> = {
  github: "Repo details, language, stars and a few small use cases will be added, and it goes into your GitHub section.",
  instagram: "Public captions are used when available. Add the caption or a transcript to get detailed topic tags when Instagram blocks access.",
  youtube: "Title and channel are read, then it is summarised and tagged.",
  article: "The page is read, summarised and tagged. Pricing or offer pages also go to your inbox.",
};

export default function PasteLink() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const {url:sharedUrl}=useLocalSearchParams<{url?:string}>();
  const insets = useSafeAreaInsets();
  const invalidate = useInvalidateAll();
  const [url, setUrl] = useState(typeof sharedUrl==="string"?(extractSharedUrl(sharedUrl)||sharedUrl):"");
  const [note, setNote] = useState("");
  const [caption, setCaption] = useState("");
  const [transcript, setTranscript] = useState("");
  const [tags, setTags] = useState("");
  const [remind, setRemind] = useState(REMIND_PRESETS[0].label);

  useEffect(()=>{
    if(typeof sharedUrl!=="string"||!sharedUrl.trim())return;
    const found=extractSharedUrl(sharedUrl);
    if(found)setUrl(found);
    const context=found?sharedUrl.replace(found,"").trim():"";
    if(context)setNote(prev=>prev||context.slice(0,1300));
  },[sharedUrl]);

  // If a link is already on the clipboard, offer it straight away.
  useEffect(() => {
    let alive = true;
    const peek = async () => {
      try {
        const t = (await Clipboard.getStringAsync()).trim();
        const found=extractSharedUrl(t);
        if (alive && found) {
          setUrl((cur) => cur || found);
          const context=t.replace(found,"").trim();
          if(context)setNote(prev=>prev||context.slice(0,1300));
        }
      } catch {
        // clipboard unavailable: user can still type or paste
      }
    };
    void peek();
    return () => { alive = false; };
  }, []);

  const kind = looksLikeUrl(url) ? detectLinkKind(url) : null;
  const days = REMIND_PRESETS.find((p) => p.label === remind)?.days ?? null;

  const save = useMutation({
    mutationFn: () => api.ingestLink(url.trim(), "share", note, {
      tags: parseTags(tags),
      ...(kind === "instagram" && caption.trim() ? { caption_text: caption.trim() } : {}),
      ...(kind === "instagram" && transcript.trim() ? { video_transcript: transcript.trim() } : {}),
      ...(days !== null ? { remind_in_days: days } : {}),
    }),
    onSuccess: (res) => {
      invalidate();
      router.replace(res?.inbox ? "/(tabs)/inbox" : (`/link/${res.link_id}` as never));
    },
  });

  const paste = async () => {
    const t = await Clipboard.getStringAsync();
    const found=extractSharedUrl(t);
    if (found) {
      setUrl(found);
      const context=t.replace(found,"").trim();
      if(context)setNote(prev=>prev||context.slice(0,1300));
    } else if (t) setUrl(t.trim());
  };

  return (
    <View style={styles.container}>
      <AppHeader title="Paste link" back />
      <FormScroll>
        <TextField label="Link" value={url} onChangeText={setUrl} placeholder="https://github.com/… or an Instagram reel" keyboardType="url" testID="link-url" />
        <PrimaryButton title="Paste from clipboard" icon="content-paste" variant="secondary" onPress={paste} testID="link-paste" />

        {kind ? (
          <Card style={styles.detected} testID="link-detected">
            <Icon name={KIND_ICON[kind]} size={26} color={colors.accentBlue} />
            <View style={{ flex: 1 }}>
              <Text style={styles.detectedTitle}>{KIND_LABEL[kind]} detected</Text>
              <Text style={styles.hint}>{KIND_HINT[kind] || KIND_HINT.article}</Text>
            </View>
          </Card>
        ) : null}

        {kind === "instagram" ? (
          <Card style={{ gap: 9 }}>
            <Text style={styles.detectedTitle}>Reel content</Text>
            <Text style={styles.hint}>Paste text from the Reel. SubMind will use it to describe and tag the content. It cannot reliably read the video or its audio from a link alone.</Text>
            <TextField label="Caption (optional)" value={caption} onChangeText={setCaption}
              placeholder="Paste the original Instagram caption and hashtags" multiline testID="instagram-caption" />
            <TextField label="Transcript (optional)" value={transcript} onChangeText={setTranscript}
              placeholder="Paste what is spoken in the video for detailed content tags" multiline testID="instagram-transcript" />
          </Card>
        ) : null}
        <TextField label="Tags (optional)" value={tags} onChangeText={setTags} placeholder="python, backend, ideas" testID="link-tags" />
        <TextField label="Note (optional)" value={note} onChangeText={setNote} placeholder="Why are you saving this? You can paste the caption too" multiline testID="link-note" />

        <View style={{ gap: 8 }}>
          <Text style={styles.label}>Remind me</Text>
          {/* the chip row has its own side padding, so pull it out to line up with the form */}
          <View style={{ marginHorizontal: -20 }}>
            <ChipRow items={REMIND_PRESETS.map((p) => p.label)} value={remind} onChange={setRemind} testIDPrefix="link-remind" />
          </View>
        </View>
      </FormScroll>
      <KeyboardStickyView>
        <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
          <PrimaryButton title="Save link" icon="bookmark-plus-outline" onPress={() => save.mutate()} loading={save.isPending} disabled={!url.trim()} testID="link-save" />
          {save.isError ? <Text style={[styles.hint, { color: colors.error, marginTop: 6 }]}>{(save.error as Error)?.message||"Could not save. Please check the URL."}</Text> : null}
        </View>
      </KeyboardStickyView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  detected: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  detectedTitle: { ...font.light, color: colors.onSurface, fontSize: 22 },
  hint: { color: colors.onSurfaceTertiary, fontSize: 13, lineHeight: 18, marginTop: 2 },
  label: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: "700", marginLeft: 4 },
  bar: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
}));
