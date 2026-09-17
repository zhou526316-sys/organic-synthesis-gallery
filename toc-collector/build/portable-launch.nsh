  !insertmacro CollectorBootstrapLog "extract-after executable=$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  Banner::destroy
  IfFileExists "$INSTDIR\${APP_EXECUTABLE_FILENAME}" collector_launch collector_missing
collector_missing:
  !insertmacro CollectorBootstrapLog "extraction-failed child executable missing"
  MessageBox MB_OK|MB_ICONSTOP "TOC Collector could not extract its executable.$\r$\nSee $TEMP\toc-collector-bootstrap.log"
  SetErrorLevel 2
  Goto collector_cleanup
collector_launch:
  !insertmacro CollectorBootstrapLog "electron-launch-before"
  ClearErrors
  ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" $R0' $0
  IfErrors collector_launch_failed collector_returned
collector_launch_failed:
  !insertmacro CollectorBootstrapLog "electron-process-create-failed"
  MessageBox MB_OK|MB_ICONSTOP "Windows could not start TOC Collector.$\r$\nSee $TEMP\toc-collector-bootstrap.log"
  SetErrorLevel 3
  Goto collector_cleanup
collector_returned:
  !insertmacro CollectorBootstrapLog "electron-exit code=$0"
  SetErrorLevel $0
  StrCmp $0 0 collector_cleanup
  MessageBox MB_OK|MB_ICONSTOP "TOC Collector exited with code $0.$\r$\nSee $TEMP\toc-collector-bootstrap.log"
collector_cleanup:
