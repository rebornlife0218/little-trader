# 統計學圖檔的共用樣式：配合網站的深色 / 淺色主題，每張圖各輸出一張(透明背景，顏色取自網站的 CSS 變數)
#   深色：<名稱>.png      淺色：<名稱>-light.png   (網頁依目前主題顯示其中一張，見 modules/stats/basic.js)
# 需要套件 ragg(install.packages("ragg"))；各章的程式開頭用 source() 載入本檔，再用 lt_fig(名稱, 寬, 高, function(T) { 畫圖 }) 產生圖檔；
# 畫圖時顏色一律用 T$blue、T$amber、T$red、T$green、T$purple、T$grey，文字用 T$fg、T$mute
LT_THEMES <- list(
  dark  = list(suffix = "",       fg = "#E7EAEE", mute = "#8E97A4", grid = "#262C38", hole = "#12161F",
               blue = "#5B8DEF", amber = "#F0B94D", red = "#F0565B", green = "#2ECC71", purple = "#A78BFA", grey = "#7D8693"),
  light = list(suffix = "-light", fg = "#1B1F27", mute = "#5B6472", grid = "#E6E9EE", hole = "#FFFFFF",
               blue = "#2F66D0", amber = "#B9780A", red = "#D92D33", green = "#14965A", purple = "#6D4FD1", grey = "#8A919C")
)
lt_out <- commandArgs(TRUE)[1]

lt_fig <- function(name, w, h, draw) {
  for (T in LT_THEMES) {
    f <- file.path(lt_out, paste0(name, T$suffix, ".png"))
    # ragg 的文字是灰階反鋸齒；Windows 的 cairo 在透明背景上會產生彩色毛邊
    if (requireNamespace("ragg", quietly = TRUE)) ragg::agg_png(f, width = w, height = h, res = 130, background = "transparent")
    else png(f, width = w, height = h, res = 130, type = "cairo", bg = "transparent")
    par(bg = NA, fg = T$mute, col.axis = T$mute, col.lab = T$fg, col.main = T$fg, family = "sans",
        las = 1, bty = "n", mgp = c(2.5, 0.6, 0), tcl = -0.2, font.main = 2, cex.main = 1, cex.axis = 0.85, cex.lab = 0.9,
        mar = c(4, 4.2, 2.6, 1))
    draw(T)
    dev.off()
  }
}
# 淡色的水平(與垂直)格線，畫在資料下面
lt_grid <- function(T, vertical = TRUE) grid(nx = if (vertical) NULL else NA, ny = NULL, col = T$grid, lty = 1, lwd = 1)
# 空白的座標區(先畫格線再疊資料用)
lt_frame <- function(T, xlim, ylim, ..., vertical = TRUE) { plot(NA, xlim = xlim, ylim = ylim, ...); lt_grid(T, vertical) }
lt_alpha <- function(col, a) adjustcolor(col, a)
lt_legend <- function(T, pos, labels, cols, ...) legend(pos, labels, col = cols, text.col = T$fg, bty = "n", ...)
