# Final Project!

# Project planning: Design Doc (due 11/4)

#### Introduction
One of the videos that brought me into programming is the series of development videos by Rujik: [Critter Crosser](https://www.youtube.com/watch?v=j9IEhJnh0Bw).
My goal is to try to implement many of the procedural features we learnt in class to create a similar procedural creature creator.


#### Goal
These are the goals ordered in importance:
- Create pleasing looking and procedurally varied creatures
- Give them procedural behaviors and animations that match their features / hidden driving traits.
- Code them to interact with their environment and train to get rewards.

**Bonus goals:**
- Advanced lighting fog and cool shaders
- Have them damagable and react to broken limbs
(These goals are from my other scrapped project and I will only attempt them if I'm undeniably goated)

#### Inspiration/reference:
- [Critter crosser](https://www.youtube.com/watch?v=j9IEhJnh0Bw)
- [Robotic procedural animation techniques](https://www.youtube.com/watch?v=KPoeNZZ6H4s)
- [Procedural shaped fish](https://www.youtube.com/watch?v=qlfh_rv6khY)
- [Tentacle](https://www.youtube.com/watch?v=-h2dkiKy_4I)
- [GDC Rain world deep dive](https://www.youtube.com/watch?v=sVntwsrjNe4)

#### Specification:
- Procedural creatures, long bodies, varying shapes
- IK for limbs, Full body animation somehow
- Simple terrain generation for background

#### Techniques:
- Limb IK, ...

#### Design:
- How will your program fit together? Make a simple free-body diagram illustrating the pieces.


# Requirements:
## Milestone 1: Implementation part 1 (due 11/11)
I haven't made much progress towards the character generator. My two main issues were not having a good idea of how the creatures should look, and not figuring out how to take any graphics engine and generate limbs, much less creatures.
### Creature design
I think my problem is I didn't have a well defined idea about how the creatures actually looked, only that I wanted to play with their procedural animations (and that they would look good). I hadn't even figured out if I wanted it to be top down or side view. I narrowed it down since then after much deliberating.  
The pros for the top down view were that the project is somewhat simpler, some of my references [do that already](https://www.youtube.com/watch?v=qlfh_rv6khY). My problem is that essentially, these animals are all just snake blobs with cosmetic arms attached to them. The animations aren't really the driving factor in this perspective.  
Ultimately, I warmed up to the idea of a pure side view idea. There is a lot more inspiration to choose from for sideview games, and I started looking more into a game that does procedural animation very well, [rain world](https://www.youtube.com/watch?v=sVntwsrjNe4).
### Engine Choice
My next bottleneck this week has been wrangling with the graphics engine I am using. I'm having difficulty figuring out how I take the raw webgl and turn it into body parts, shapes, etc.
I explored switching to unity I made a simple chain of circles for a character, I ultimately decided to come back and give webgl another shot for all the reasons I chose webgl in the first place.
I am currently looking into using threejs or pixijs instead, I think either option would simplify my process going forward.
### Week 2 plans:
- Pick a javascript rendering engine, create an oblong shape and see that shaders work on it.
- Create core systems I will be using soon, Fabrik/CCD IK.
- I want a blob body and two legs coming out of it somehow.
- Work at parametrizing the animations to work with different shapes and sizes well, shorter legs trot faster, more legs means varied gaits.
- **Leave the visuals as blobs until I have an actual generator working**
  - once I have some animations, ill look into how to make these blobs look like limbs.
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

