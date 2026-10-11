# 第 4 章的 R 圖檔產生程式(二元離散型的聯合 PMF、二元連續型的聯合 PDF)
# 用法(在 little-trader 資料夾下)：Rscript web/content/stats/basic/r/ch04-figures.R web/content/stats/basic/img
out <- commandArgs(TRUE)[1]
png(file.path(out, "ch04-joint.png"), width = 1000, height = 460, res = 120, type = "cairo")
par(mfrow = c(1, 2), mar = c(4.2, 4.2, 3, 1.5))

# ---- 二元離散型：X = 正面數、Y = 第一枚是否正面 ----
pts <- data.frame(x = c(0, 1, 1, 2), y = c(0, 0, 1, 1), p = rep(1 / 4, 4))
plot(NA, xlim = c(-0.5, 2.5), ylim = c(-0.5, 1.5), xaxt = "n", yaxt = "n",
     main = "Joint PMF  f(x, y) = P(X = x, Y = y)", xlab = "x (number of heads)", ylab = "y (1st coin is head)")
axis(1, at = 0:2); axis(2, at = 0:1)
grid <- expand.grid(x = 0:2, y = 0:1)
points(grid$x, grid$y, pch = 1, cex = 1.2, col = "grey70")
symbols(pts$x, pts$y, circles = rep(0.22, 4), inches = FALSE, add = TRUE, bg = adjustcolor("steelblue", 0.75), fg = "steelblue")
text(pts$x, pts$y, "1/4", col = "white", font = 2)
text(c(2, 0), c(0, 1), "0", col = "grey50")

# ---- 二元連續型：f(x, y) = x + y，0 <= x, y <= 1 ----
g <- seq(0, 1, length.out = 120)
z <- outer(g, g, "+")
image(g, g, z, col = hcl.colors(40, "Blues 3", rev = TRUE), main = "Joint PDF  f(x, y) = x + y",
      xlab = "x", ylab = "y", asp = 1)
contour(g, g, z, add = TRUE, levels = seq(0.25, 1.75, 0.25), col = "grey30", labcex = 0.7)
polygon(c(0, 1, 0), c(0, 0, 1), col = adjustcolor("darkorange", 0.35), border = "darkorange", lwd = 2)
text(0.28, 0.28, "P(X + Y <= 1)\n= 1/3", cex = 0.9, font = 2)
dev.off()
