# 🫧 Guestbook 

🍊 Browser-based collaborative guestbook where people can leave notes, write, and draw together simultaneously in real-time on shared 2D/3D canvases!

https://maggieyung.github.io/notes/

<img  height="500" alt="image" src="https://github.com/user-attachments/assets/6ecf2718-6485-413d-b015-0b8db2807f99" />




# ☃️ Description


### 💌 Features


- 🖌️ **Painting tools:** 
    - Pen | Pencil | Eraser with pressure curve and adjustable settings (size, opacity, flow)
    - Color wheel and eyedropper
- 🖼️ **2D notes:** Freehand drawing canvas with undo/redo history | Text content | Import media

<img  height="270" src="../img/paintfun.gif" /> <img  height="270" src="../img/painttree.gif" />

- 🎨 **3D canvases:** Cube, sphere, or 2.5D modes. Draw on any 2D plane within 3D scene!


<img  height="270" src="../img/spunchbob.gif"/> 

- 🙌 **Collaborative drawing:** Multiple users can draw on the same canvas with real-time updates and presence cursors.

<img  height="270" src="../img/cursor.gif" /> <img  height="270" src="../img/ghastdraw.gif" />


### 🎐 Technologies

- **JavaScript**: drawing functionality/interactivity
- **WebGL**/**Three.js**: 3D canvases
- **HTML/CSS**: appearance and layout
- **Firebase Realtime Database**: sync and note changes/snapshots


# 🫐Usage

### 🍀 Keyboard & Mouse Shortcuts

- **[MB2]:** Open the dropdown context menu for quick actions
- **[b]:** Switch to Pen
- **[p]:** Switch to Pencil
- **[e]:** Switch to Eraser
- **[Ctrl/Cmd + z]** Undo
- **[Ctrl/Cmd + y]:** Redo
- **[n]:** New text note
- **[d]:** New paint note
- **[h]:** Flip paint note horizontally
- **[Shift + MB1]:** Rotate 3D scene
- Drag note corners to move

<img height="300" alt="image" src="https://github.com/user-attachments/assets/b80f66a4-57ed-49b1-ae9c-80ab6ef8377e" />



### 🎄 Local development
- Requires setting up Firebase (creating a Firebase project and enabling Realtime Database).
- Update `notes/js/firebase.js` with your project keys and database URL



# 🍈 Future Improvements

- **Avatars showing active users:** Add visual indicators (desktop pets) to display which users are currently active and what they're working on.
- **Personalization**: Customizing brushes, UI, or how the cursors appear
- **Real-time sync:** When multiple users draw on the same note simultaneously, strokes can occasionally be overwritten due to the snapshot sync. Move from canvas snapshots to individual stroke events
- **Drawing layers:** Implement layer arrangement options to keep canvas elements separate to be edited independently.
- **Export/import:** Save and restore whiteboard canvas or individual notes

<img height="200" alt="image" src="https://github.com/user-attachments/assets/26f4656d-71b9-4bd8-ac65-954353a6cb2f" />

