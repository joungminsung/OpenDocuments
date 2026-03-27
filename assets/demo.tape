# OpenDocuments Demo
Output assets/demo.gif

Set Shell "bash"
Set FontSize 15
Set Width 900
Set Height 520
Set Theme "Catppuccin Mocha"
Set Padding 15
Set TypingSpeed 35ms
Set CursorBlink false

# Pre-setup: docs already exist in /tmp/od-demo
Require opendocuments

Sleep 500ms
Type "cd /tmp/od-demo && ls"
Enter
Sleep 1.5s

Type "opendocuments index ."
Enter
Sleep 6s

Type `opendocuments ask "How does authentication work?"`
Enter
Sleep 10s

Type `opendocuments ask "What is the AI team budget?" --profile fast`
Enter
Sleep 8s

Type "opendocuments doctor"
Enter
Sleep 5s

Sleep 2s
