---
title: Windows 11 8月末自定义鼠标指针问题详解
date: 2026-10-05 22:18:00
categories:
  - 折腾软件
tags:
  - 系统
  - Windows 11
  - Bug
description: 借用哈基米原话：极其荒谬的系统本地化（中英文键名混淆）Bug。
---

## Windows 11 8月末自定义鼠标问题详解

8月末，Microsoft向本人使用的Windows 11 Insider Beta推送了[26220.9223](https://learn.microsoft.com/en-us/windows-insider/release-notes/beta/preview-build-26220-9223)版本更新，同时正式版应该也推送了一个类似的更新(KB5120998/KB5120996)，导致自定义鼠标指针**部分**失灵，默认的箭头、繁忙等待等指针失效，而输入、调整窗口大小等指针仍可用。

我通过设置和经典鼠标设置(main.cpl)均无法恢复自定义鼠标，AI猜测的无障碍设置问题也不成立。一气之下直接选择了[procmon](https://learn.microsoft.com/en-us/sysinternals/downloads/procmon)看日志。

看完之后直接被气笑了：

点击应用设置后，rundll32.exe尝试读取当前的鼠标配置，这时一切正常：![9223 Procmon读取1](/images/mouse-9223-read1.png)

紧接着尝试读切换的主题，也没有问题：![9223 Procmon读取主题](/images/mouse-9223-scheme.png)

接下来写入注册表，依旧正常：![9223 Procmon写入](/images/mouse-9223-write.png)

但是最后读取注册表并刷新鼠标，问题出现了：![9223 Procmon问题读取](/images/mouse-9223-read2.png)

**竟然在读中文键名！！！**

**中文键名！！！还是一部分中文一部分英文！！！所以有一些Read会返回NAME NOT FOUND，导致这些指针不可用！**

**究竟是什么神奇宝贝才能写出这种代码？**

![meme](/images/hugehard.jpeg "有端联想")

算了，知道了问题所在，也就该写解决方案了：

网络上比较流行的两种解决方案，一种是卸载更新，另一种大致原理是跳过注册表，通过SetSystemCursor直接向会话内写鼠标指针位置，例如[该GitHub项目](https://github.com/Arcadeq/windows-cursor-scheme-fix)，缺点就是需要开机自启并始终挂在后台。

但其实有一个更加简单粗暴的方法，就是直接在`HKCU\Control Panel\Cursors`注册表内把中文键名自己写进去，大致操作如下：

先在鼠标设置内选中自己想要用的scheme并应用，这个时候鼠标指针应该部分生效；

然后把以下代码放进一个ps1文件里，在Powershell内运行（该代码由Gemini完成，亲测pwsh7可用）：

```powershell
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$regPath = 'HKCU:\Control Panel\Cursors'

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " 正在修复 Windows 11 光标中文注册表键名映射 (Beta 26220+)..." -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 检查当前注册表配置
if (-not (Test-Path -Path $regPath)) {
    Write-Error "未找到光标注册表路径: $regPath"
}

$cursors = Get-ItemProperty -Path $regPath

# Procmon 日志中出现的所有 "NAME NOT FOUND" 中文键名与对应的标准英文键名映射表
$aliasMappings = [ordered]@{
    '箭头'     = 'Arrow'       # 标准箭头选择 (OCR_NORMAL)
    '等待'     = 'Wait'        # 忙碌状态 (OCR_WAIT)
    '十字线'   = 'Crosshair'   # 精确选择 (OCR_CROSS)
    '否'       = 'No'          # 不可用 (OCR_NO)
    '帮助'     = 'Help'        # 帮助选择 (OCR_HELP)
    '手形'     = 'Hand'        # 链接选择 (OCR_HAND)
    '个人'     = 'Person'      # 个人选择 (OCR_PERSON)
    '自动运行' = 'AppStarting' # 后台运行 (OCR_APPSTARTING)
    '图标'     = 'Arrow'       # 图标光标 (若无独立图标，默认回退至主光标)
}

$updatedCount = 0

foreach ($entry in $aliasMappings.GetEnumerator()) {
    $cnKey = $entry.Key
    $enKey = $entry.Value
    
    $targetValue = $null

    # 1. 尝试直接获取标准英文键的值
    if ($cursors.PSObject.Properties[$enKey] -and -not [string]::IsNullOrWhiteSpace([string]$cursors.$enKey)) {
        $targetValue = [string]$cursors.$enKey
    }
    # 2. 特殊回退逻辑处理
    elseif ($cnKey -eq '自动运行') {
        if ($cursors.PSObject.Properties['AppStarting'] -and -not [string]::IsNullOrWhiteSpace([string]$cursors.AppStarting)) {
            $targetValue = [string]$cursors.AppStarting
        } elseif ($cursors.PSObject.Properties['Wait'] -and -not [string]::IsNullOrWhiteSpace([string]$cursors.Wait)) {
            $targetValue = [string]$cursors.Wait
        }
    }
    elseif ($cnKey -eq '图标') {
        if ($cursors.PSObject.Properties['Icon'] -and -not [string]::IsNullOrWhiteSpace([string]$cursors.Icon)) {
            $targetValue = [string]$cursors.Icon
        } elseif ($cursors.PSObject.Properties['Arrow'] -and -not [string]::IsNullOrWhiteSpace([string]$cursors.Arrow)) {
            $targetValue = [string]$cursors.Arrow
        }
    }

    # 3. 写入注册表中文别名键
    if (-not [string]::IsNullOrWhiteSpace($targetValue)) {
        Set-ItemProperty -Path $regPath -Name $cnKey -Value $targetValue -Type ExpandString
        Write-Host "  [+] 成功同步: '$cnKey' <- '$enKey' ($targetValue)" -ForegroundColor Green
        $updatedCount++
    }
    else {
        Write-Host "  [-] 跳过设置: '$cnKey' (源键 '$enKey' 当前未配置)" -ForegroundColor DarkGray
    }
}

Write-Host "`n已成功同步 $updatedCount 个中文别名键值。" -ForegroundColor Cyan

# 4. 广播 SPI_SETCURSORS 系统通知，使 Windows 立即重新从注册表装载光标
Write-Host "正在通知 Windows 桌面窗口管理器与 Shell 刷新光标..." -ForegroundColor Cyan

if (-not ('CursorReloader' -as [type])) {
    $csharpCode = @"
using System;
using System.Runtime.InteropServices;
public static class CursorReloader
{
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SystemParametersInfo(uint uiAction, uint uiParam, IntPtr pvParam, uint fWinIni);
}
"@
    Add-Type -TypeDefinition $csharpCode
}

$SPI_SETCURSORS = 0x0057
$SPIF_UPDATEINIFILE = 0x01
$SPIF_SENDCHANGE = 0x02

$res = [CursorReloader]::SystemParametersInfo(
    $SPI_SETCURSORS,
    0,
    [IntPtr]::Zero,
    ($SPIF_UPDATEINIFILE -bor $SPIF_SENDCHANGE)
)

if ($res) {
    Write-Host "系统光标刷新广播已成功发送！自定义光标现已生效。" -ForegroundColor Green
} else {
    Write-Host "刷新通知已发出。若未立即切换，可在系统鼠标属性界面点击一次'应用'生效。" -ForegroundColor Yellow
}

Write-Host "============================================================" -ForegroundColor Cyan
```

这时所有自定义鼠标指针应当会立即生效，而且一劳永逸。

*如果换指针了，则再运行一次该脚本即可。*

~~继续当饮月梦男去了:)~~

!!!+ info "草台班子微软"
    尽管正式版系统已经在9月10日左右修复了这个Bug（[KB5124008](https://support.microsoft.com/en-us/servicing/os/windows-11/2026/09/kb5124008-windows-11-24h2-25h2-security-update)），但是截至10月5日，25H2 Beta版本 26220.9587仍未修复该Bug。
    ![9587 Procmon截屏](/images/mouse-9587.png)
