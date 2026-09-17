Var BootstrapHandle

!macro CollectorBootstrapLog MESSAGE
  ClearErrors
  FileOpen $BootstrapHandle "$TEMP\toc-collector-bootstrap.log" a
  IfErrors +4 0
  FileSeek $BootstrapHandle 0 END
  FileWrite $BootstrapHandle "[native portable ${VERSION}] ${MESSAGE}$\r$\n"
  FileClose $BootstrapHandle
!macroend
