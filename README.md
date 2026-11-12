# Final Project: Procedural Cakes
The original assignment description can be found [**here**](https://github.com/CIS-5660-Fall-2026/final-project/blob/main/README.md).

## Project Planning: Design Doc

### Motivation & Goals
To get more experience working with procedural systems in Houdini, I plan to make a tool for procedural cake creation. The idea is to be able to create multi-tier cakes with varying decorations without having to manually place them all.

### References
| <img width="200" src="https://inbloombakery.com/wp-content/uploads/2021/05/Chocolate-Berry-Cake-2-1.jpg"> | <img width="200" src="https://i.pinimg.com/1200x/49/5a/13/495a13e95814e4185866b07ee5b43a6f.jpg">| <img width="200" src="https://i.pinimg.com/1200x/93/14/81/931481e6ec65d8d68b0cd0efae3f4ab8.jpg"> |
|:---:|:---:|:---:|
| *A drip cake* | *A multi-tier cake with various piping frills and borders* | *A cake with pearls and candles* | 
- While there is no comprehensive compilation of cake decorations, there are [**common piping techniques**](https://iscreamforbuttercream.com/12-simple-and-easy-buttercream-cake-borders)
- The anatomy of layered cakes (which is what my tool will be focused on) is described [**here**](https://iscreamforbuttercream.com/anatomy-of-a-decorated-cake/)
- Some existing tools that I will be using as reference are: 
  - [**Procedural Cake Tool**](https://www.xcczheng.com/procedural-cake-tool) (Houdini): for cake options and menu organization
  - [**Procedural Cupcake Generator**](https://blenderartists.org/t/procedural-cupcake-generator/1536718) (Blender): for icing modeling

### Specification & Techniques
The main features of this project are **cake tier stacking**, with each tier having their **own set of decorations** from a selection. Depending on the decoration, they may be parametrable (e.g., piping thickness, scatter pattern).

For getting the HDA set up, I will be referencing the [**procedural house**](https://youtu.be/uIe97023sDk) tutorial from Homework 4. For cake detail creation and placement, some related tutorials that I may reference include Houdini's "[**Cupcake Project**](https://www.youtube.com/playlist?list=PLAu3RshPTj6BSWzdPL8FglQZQBctnE9im)" series and a  [**Procedural Cake Tutorial**](https://youtu.be/0Et-DxwvbYk). For the texture of the cake, I most likely will be using noise referencing [*this tutorial*](https://youtu.be/mORz1y05T7E).

*A loose outline of the tool's workflow/structure:*
<img src="https://docs.google.com/drawings/d/e/2PACX-1vSA_1YfW4Je9j2P9rDc9oMiaO4QuAg5Xvx94C4WIUfyjFztwNz3Yk0k_bbYxwLtld5ke7qKpuALtjpt/pub?w=960&amp;h=720">

### Timeline
- **Milestone 1** (11/11): Creation of cake HDA and its parameters (number of layers; icing properties; texture?)
- **Milestone 2** (11/23): Creation of decoration assets, start of placement logic
- **Final Submission** (11/30): Finish placement logic, polish

---

## Milestone 1: Implementation part 1 (due 11/11)
Begin implementing your engine! Don't worry too much about polish or parameter tuning -- this week is about getting together the bulk of your generator implemented. By the end of the week, even if your visuals are crude, the majority of your generator's functionality should be done.

Put all your code in your forked repository.

Submission: Add a new section to your README titled: Milestone #1, which should include
- written description of progress on your project goals. If you haven't hit all your goals, what's giving you trouble?
- Examples of your generators output so far
We'll check your repository for updates. No need to create a new pull request.

## Milestone 2: Implementation part 2 (due 11/23)
We're over halfway there! This week should be about fixing bugs and extending the core of your generator. Make sure by the end of this week _your generator works and is feature complete._ Any core engine features that don't make it in this week should be cut! Don't worry if you haven't managed to exactly hit your goals. We're more interested in seeing proof of your development effort than knowing your planned everything perfectly. 

Put all your code in your forked repository.

Submission: Add a new section to your README titled: Milestone #3, which should include
- written description of progress on your project goals. If you haven't hit all your goals, what did you have to cut and why? 
- Detailed output from your generator, images, video, etc.
We'll check your repository for updates. No need to create a new pull request.

Come to class on the due date with a WORKING COPY of your project. We'll be spending time in class critiquing and reviewing your work so far.

## Final submission (due 11/30)
Time to polish! Spen this last week of your project using your generator to produce beautiful output. Add textures, tune parameters, play with colors, play with camera animation. Take the feedback from class critques and use it to take your project to the next level.

Submission:
- Push all your code / files to your repository
- Come to class ready to present your finished project
- Update your README with two sections 
  - final results with images and a live demo if possible
  - post mortem: how did your project go overall? Did you accomplish your goals? Did you have to pivot?
