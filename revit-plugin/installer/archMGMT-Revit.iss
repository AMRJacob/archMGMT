; archMGMT for Revit — Revit 2026 add-in installer (per user, no admin rights needed).
; Built by .github/workflows/revit-plugin.yml:  iscc /DAppVersion=x.y.z /DSrc=<build output> archMGMT-Revit.iss
;
; Each version goes into its own folder (…\Addins\2026\archMGMT\<version>) and the .addin is rewritten to
; point at it. So this can run while Revit is open (the loaded DLL is never touched): the running Revit keeps the
; old version and the new one loads the next time Revit starts. Older version folders are removed when not in use.
; The plugin runs this silently itself to update: /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /CURRENTUSER

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef Src
  #define Src "..\src\bin\Release\net8.0-windows"
#endif
#define AddinsDir "{userappdata}\Autodesk\Revit\Addins\2026"
#define BaseDir AddinsDir + "\archMGMT"

[Setup]
AppId={{E7569379-AB46-4E22-964C-65E654572B10}
AppName=archMGMT for Revit 2026
AppVersion={#AppVersion}
AppVerName=archMGMT for Revit {#AppVersion} (Revit 2026)
AppPublisher=AMR Architects
AppPublisherURL=https://github.com/AMRJacob/archMGMT
AppSupportURL=https://github.com/AMRJacob/archMGMT/issues
DefaultDirName={#BaseDir}\{#AppVersion}
UsePreviousAppDir=no
UninstallFilesDir={#BaseDir}\uninstall
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
DisableWelcomePage=no
PrivilegesRequired=lowest
; Never close or restart Revit: nothing it has loaded is overwritten.
CloseApplications=no
RestartApplications=no
OutputBaseFilename=archMGMT-Revit-Setup
OutputDir=..\out
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=archMGMT for Revit (Revit 2026)
VersionInfoVersion={#AppVersion}
VersionInfoCompany=AMR Architects
VersionInfoDescription=archMGMT Revit add-in installer
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Messages]
WelcomeLabel2=This installs or updates archMGMT for Revit 2026 (AMR tab › archMGMT), version {#AppVersion}.%n%nIt is installed for your Windows account only — no administrator rights needed. Revit can stay open: the new version loads the next time Revit starts.
FinishedLabelNoIcons=archMGMT for Revit {#AppVersion} is installed.%n%nIf Revit is open, restart it to use this version. Look for AMR › archMGMT › Sheet Tasks; the pane docks at the right. The first time, Revit asks whether to load the add-in: choose "Always Load".%n%nFrom now on the add-in updates itself.

[InstallDelete]
; A half-finished earlier attempt at this same version.
Type: filesandordirs; Name: "{app}"

[Files]
Source: "{#Src}\ArchMgmtRevit.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#Src}\ArchMgmtRevit.pdb"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
; WebView2 fallback copy — used only if Revit hasn't loaded its own.
Source: "{#Src}\Microsoft.Web.WebView2.Core.dll"; DestDir: "{app}\webview2"; Flags: ignoreversion
Source: "{#Src}\Microsoft.Web.WebView2.Wpf.dll"; DestDir: "{app}\webview2"; Flags: ignoreversion
Source: "{#Src}\runtimes\win-x64\native\WebView2Loader.dll"; DestDir: "{app}\webview2"; Flags: ignoreversion

[UninstallDelete]
Type: files; Name: "{#AddinsDir}\archMGMT.addin"
Type: filesandordirs; Name: "{#BaseDir}"

[Code]
procedure WriteAddin();
var
  Xml: String;
begin
  Xml :=
    '<?xml version="1.0" encoding="utf-8"?>' + #13#10 +
    '<RevitAddIns>' + #13#10 +
    '  <AddIn Type="Application">' + #13#10 +
    '    <Name>archMGMT</Name>' + #13#10 +
    '    <Assembly>archMGMT\{#AppVersion}\ArchMgmtRevit.dll</Assembly>' + #13#10 +
    '    <AddInId>e7569379-ab46-4e22-964c-65e654572b10</AddInId>' + #13#10 +
    '    <FullClassName>ArchMgmt.App</FullClassName>' + #13#10 +
    '    <VendorId>AMRA</VendorId>' + #13#10 +
    '    <VendorDescription>AMR Architects, https://github.com/AMRJacob/archMGMT</VendorDescription>' + #13#10 +
    '  </AddIn>' + #13#10 +
    '</RevitAddIns>' + #13#10;
  ForceDirectories(ExpandConstant('{#AddinsDir}'));
  if not SaveStringToFile(ExpandConstant('{#AddinsDir}\archMGMT.addin'), Xml, False) then
    RaiseException('Could not write the Revit add-in file.');
end;

{ Remove other version folders. A folder Revit has loaded can't be removed and is left for next time. }
procedure CleanOldVersions();
var
  FR: TFindRec;
  Base, Name: String;
begin
  Base := ExpandConstant('{#BaseDir}');
  if FindFirst(Base + '\*', FR) then
  try
    repeat
      Name := FR.Name;
      if (Name <> '.') and (Name <> '..') and (FR.Attributes and FILE_ATTRIBUTE_DIRECTORY <> 0)
        and (CompareText(Name, '{#AppVersion}') <> 0) and (CompareText(Name, 'uninstall') <> 0) then
        DelTree(Base + '\' + Name, True, True, True);
    until not FindNext(FR);
  finally
    FindClose(FR);
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    WriteAddin();
    CleanOldVersions();
  end;
end;
