param(
  [int]$Port = 8000,
  [string]$Root = "dist"
)

$ErrorActionPreference = "Stop"

$rootPath = (Resolve-Path -LiteralPath $Root).Path
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), $Port)
$listener.Start()

Write-Host "Serving $rootPath at http://127.0.0.1:$Port/"

$contentTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".js" = "text/javascript; charset=utf-8"
  ".css" = "text/css; charset=utf-8"
  ".svg" = "image/svg+xml"
  ".json" = "application/json; charset=utf-8"
  ".png" = "image/png"
  ".jpg" = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".ico" = "image/x-icon"
}

function Resolve-RequestPath {
  param([string]$RequestPath)

  $cleanPath = [System.Uri]::UnescapeDataString($RequestPath.Split("?")[0].TrimStart("/"))
  if ([string]::IsNullOrWhiteSpace($cleanPath)) {
    $cleanPath = "index.html"
  }

  $candidate = Join-Path -Path $rootPath -ChildPath $cleanPath
  if (Test-Path -LiteralPath $candidate -PathType Container) {
    $candidate = Join-Path -Path $candidate -ChildPath "index.html"
  }

  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
    $candidate = Join-Path -Path $rootPath -ChildPath "index.html"
  }

  $resolved = (Resolve-Path -LiteralPath $candidate).Path
  if (-not $resolved.StartsWith($rootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $null
  }

  return $resolved
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
      $requestLine = $reader.ReadLine()

      while ($reader.ReadLine()) {
      }

      if (-not $requestLine) {
        $client.Close()
        continue
      }

      $parts = $requestLine.Split(" ")
      $filePath = Resolve-RequestPath $parts[1]

      if (-not $filePath) {
        $body = [System.Text.Encoding]::UTF8.GetBytes("Forbidden")
        $header = "HTTP/1.1 403 Forbidden`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
        $stream.Write([System.Text.Encoding]::ASCII.GetBytes($header), 0, $header.Length)
        $stream.Write($body, 0, $body.Length)
        continue
      }

      $bytes = [System.IO.File]::ReadAllBytes($filePath)
      $extension = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
      $contentType = $contentTypes[$extension]
      if (-not $contentType) {
        $contentType = "application/octet-stream"
      }

      $header = "HTTP/1.1 200 OK`r`nContent-Type: $contentType`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
      $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
      $stream.Write($headerBytes, 0, $headerBytes.Length)
      $stream.Write($bytes, 0, $bytes.Length)
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
