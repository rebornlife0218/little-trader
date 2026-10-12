# 第 4 章的 R 圖檔產生程式(二元離散型的聯合 PMF、二元連續型的聯合 PDF；深色、淺色各一張，樣式見 theme.R)
# 用法(在 little-trader 資料夾下)：Rscript web/content/stats/basic/r/ch04-figures.R web/content/stats/basic/img
.dir <- dirname(sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE)))
source(file.path(.dir, "theme.R"))

lt_fig("ch04-joint", 1040, 480, function(T) {
  par(mfrow = c(1, 2), mar = c(4, 4.2, 2.6, 1.5))
  # ---- 二元離散型：X = 正面數、Y = 第一枚是否正面 ----
  pts <- data.frame(x = c(0, 1, 1, 2), y = c(0, 0, 1, 1))
  lt_frame(T, c(-0.5, 2.5), c(-0.5, 1.5), main = "Joint PMF  f(x, y) = P(X = x, Y = y)", xlab = "x (number of heads)", ylab = "y (1st coin is head)",
           xaxt = "n", yaxt = "n")
  axis(1, at = 0:2, lwd = 0); axis(2, at = 0:1, lwd = 0)
  grid0 <- expand.grid(x = 0:2, y = 0:1)
  points(grid0$x, grid0$y, pch = 1, cex = 1.2, col = T$mute)
  symbols(pts$x, pts$y, circles = rep(0.22, 4), inches = FALSE, add = TRUE, bg = lt_alpha(T$blue, 0.85), fg = T$blue)
  text(pts$x, pts$y, "1/4", col = "white", font = 2)
  text(c(2, 0), c(0, 1), "0", col = T$mute)
  # ---- 二元連續型：f(x, y) = x + y，0 <= x, y <= 1 ----
  g <- seq(0, 1, length.out = 120); z <- outer(g, g, "+")
  pal <- colorRampPalette(c(lt_alpha(T$blue, 0.08), lt_alpha(T$blue, 0.95)), alpha = TRUE)(40)
  image(g, g, z, col = pal, main = "Joint PDF  f(x, y) = x + y", xlab = "x", ylab = "y", asp = 1, axes = FALSE)
  axis(1, lwd = 0); axis(2, lwd = 0)
  contour(g, g, z, add = TRUE, levels = seq(0.25, 1.75, 0.25), col = T$fg, labcex = 0.7, vfont = NULL)
  polygon(c(0, 1, 0), c(0, 0, 1), col = lt_alpha(T$amber, 0.35), border = T$amber, lwd = 2)
  text(0.28, 0.28, "P(X + Y <= 1)\n= 1/3", cex = 0.9, font = 2, col = T$fg)
})
