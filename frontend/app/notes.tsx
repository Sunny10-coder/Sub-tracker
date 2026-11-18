import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, useInvalidateAll, useNotes } from "@/src/lib/api";
import { AppHeader, Card, EmptyState, Icon, PrimaryButton } from "@/src/components/ui";
import { refreshHomeWidget } from "@/src/lib/widget-sync";
import { font, makeStyles, useTheme } from "@/src/theme";

export default function Notes() {
  const styles=useStyles();
  const {colors}=useTheme();
  const inset=useSafeAreaInsets();
  const notes=useNotes();
  const invalidate=useInvalidateAll();
  const [editing,setEditing]=useState<string|null>(null);
  const [body,setBody]=useState("");
  const [title,setTitle]=useState("");
  const [editingOpen,setEditingOpen]=useState(false);

  const reset=()=>{
    setEditing(null);setBody("");setTitle("");setEditingOpen(false);
  };
  const save=useMutation({
    mutationFn:()=>editing?api.updateNote(editing,body.trim(),title.trim()):
      api.createNote(body.trim(),title.trim()),
    onSuccess:()=>{reset();invalidate();notes.refetch();void refreshHomeWidget();}
  });
  const remove=useMutation({
    mutationFn:(id:string)=>api.deleteNote(id),
    onSuccess:()=>{reset();invalidate();notes.refetch();void refreshHomeWidget();}
  });
  const change=(note:any)=>{
    setEditing(String(note.id));setBody(String(note.body||""));
    setTitle(String(note.title||""));setEditingOpen(true);
  };
  const confirmDelete=(note:any)=>{
    Alert.alert("Delete note?","This removes the note from SubMind and the home-screen widget.",[
      {text:"Keep",style:"cancel"},
      {text:"Delete",style:"destructive",onPress:()=>remove.mutate(String(note.id))}
    ]);
  };

  return (
    <View style={styles.container}>
      <AppHeader title="notes" subtitle="Saved on this device" back
        right={<Pressable testID="notes-add" onPress={()=>{
          reset();setEditingOpen(true);
        }} accessibilityRole="button" accessibilityLabel="New note">
          <Icon name="plus-circle-outline" size={28} color={colors.brandPrimary} />
        </Pressable>} />
      <ScrollView contentContainerStyle={{padding:16,paddingBottom:inset.bottom+32,gap:10}}>
        {editingOpen ? (
          <Card style={styles.editor}>
            <Text style={styles.label}>{editing?"edit note":"new note"}</Text>
            <TextInput style={styles.titleInput} value={title} onChangeText={setTitle}
              placeholder="Title (optional)" placeholderTextColor={colors.muted}
              maxLength={100} testID="note-title" />
            <TextInput style={styles.bodyInput} value={body} onChangeText={setBody}
              placeholder="Write anything you want to remember..."
              placeholderTextColor={colors.muted} multiline textAlignVertical="top"
              maxLength={5000} testID="note-body" />
            {save.isError?<Text style={styles.error}>{(save.error as Error).message}</Text>:null}
            <View style={styles.actions}>
              <PrimaryButton title="Save note" icon="content-save" onPress={()=>save.mutate()}
                loading={save.isPending} disabled={!body.trim()||save.isPending}
                testID="note-save" style={{flex:1}} />
              <PrimaryButton title="Cancel" variant="secondary" onPress={reset}
                disabled={save.isPending} style={{flex:1}} />
            </View>
          </Card>
        ) : (
          <Pressable onPress={()=>setEditingOpen(true)} accessibilityRole="button"
            style={styles.newTile} testID="notes-create-tile">
            <Icon name="plus" color="#FFFFFF" size={22}/>
            <Text style={styles.newText}>add a note</Text>
          </Pressable>
        )}
        {(notes.data||[]).length===0&&!editingOpen?
          <EmptyState icon="note-text-outline" title="No notes yet"
            message="Notes appear here and in your three-section home-screen widget." />:null}
        {(notes.data||[]).map((n:any)=>(
          <Card key={String(n.id)} style={styles.note}>
            <Pressable onPress={()=>change(n)} style={{flex:1,gap:6}}
              accessibilityRole="button" accessibilityLabel={"Edit "+String(n.title||"note")}
              testID={"notes-item-"+n.id}>
              <Text style={styles.noteTitle} numberOfLines={2}>{n.title||"Untitled note"}</Text>
              <Text style={styles.preview} numberOfLines={3}>{n.body||""}</Text>
            </Pressable>
            <Pressable onPress={()=>confirmDelete(n)} hitSlop={12}
              accessibilityRole="button" accessibilityLabel="Delete note">
              <Icon name="trash-can-outline" color={colors.muted} size={21}/>
            </Pressable>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}
const useStyles=makeStyles(c=>({
  container:{flex:1,backgroundColor:c.surface},
  label:{color:c.onSurfaceSecondary,fontSize:15,fontWeight:"700" as const},
  editor:{gap:10,padding:14},
  titleInput:{backgroundColor:c.surfaceTertiary,borderWidth:1,borderColor:c.border,
    minHeight:47,padding:12,fontSize:16,color:c.onSurface},
  bodyInput:{backgroundColor:c.surfaceTertiary,borderWidth:1,borderColor:c.border,
    minHeight:150,padding:12,fontSize:16,color:c.onSurface},
  error:{color:c.error,fontSize:13},
  actions:{flexDirection:"row" as const,gap:8},
  newTile:{backgroundColor:c.accentBlue,padding:18,flexDirection:"row" as const,
    alignItems:"center" as const,gap:12},
  newText:{color:"#FFFFFF",fontSize:19,...font.light},
  note:{backgroundColor:c.surfaceSecondary,padding:14,flexDirection:"row" as const,
    alignItems:"flex-start" as const,gap:12},
  noteTitle:{color:c.onSurface,fontSize:18,fontWeight:"700" as const},
  preview:{color:c.onSurfaceSecondary,fontSize:14,lineHeight:20}
}));
