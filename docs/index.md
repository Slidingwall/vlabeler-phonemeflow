---
title: HOME 主页
nav_order: 1
---

# vlabeler-phonemeflow

{: .fs-6 .fw-300 } 
vLabeler 中用于 UTAU/DeepVocal/VocalSharp 等软件的实验性标注器，仍在开发中。  
Experimental labeler for UTAU/DeepVocal/VocalSharp etc in vLabeler, still in development.  
{: .fs-6 .fw-300 } 

[View on Github](https://github.com/Slidingwall/vlabeler-phonemeflow/){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 .mr-2 }   [mandarin-reclist](/mandarin-reclist/){: .btn .fs-5 .mb-4 .mb-md-0 }    

创建这个标注器的初衷，是想在标注UTAU/DeepVocal/VocalSharp的声库时更接近Textgrid和lab等AI声库标注格式——只需一次性标注采样内所有音素的起止点，无需记忆CV/VC/VCV各自的位置规则。oto的5个参数本质上均由相邻音素及稳定段的起止位置推导得出。因此，在TextGrid/lab精度基础上增加稳定段标注，再通过插件自动导出为上述格式，理论上是可行的。  
This labeler was originally intended to bring the labeling experience for UTAU/DeepVocal/VocalSharp voicebanks closer to that of AI‑style formats like TextGrid and lab—mark all phoneme boundaries in one pass, no need to remember CV/VC/VCV‑specific rules. The five oto.ini parameters are essentially derived from adjacent phoneme positions and stable‑segment boundaries. So it’s theoretically feasible to add stable‑segment markers on top of TextGrid/lab precision and auto‑export to those formats via a plugin.

这个项目还在开发中，对于一些想象不到的边界情况，脚本可能表现得不太稳定，欢迎试用与反馈。  
This project is still under development; for unforeseen edge cases, the script may not behave entirely as expected. Your feedback and testing are welcome.  